import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { api, ApiError } from "../src/api";
import { request } from "../src/api/client";
import { PlacesMap } from "../src/components/map/PlacesMap";
import { LocationForm } from "../src/components/profile/LocationForm";
import * as locationUtils from "../src/utils/location";
import { CityConfirmationRequired, saveDetectedLocation } from "../src/utils/location";
import { user } from "./fixtures";

vi.mock("../src/context/AuthContext", () => ({ useAuth: () => ({ patchUser: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../src/context/ToastContext", () => ({ useToast: () => ({ notify: vi.fn() }) }));
const suggestion = { city: "Ben Guerir", country_code: "MA", confirmation_token: "signed-city-token" };
const payload = { error: { message: "Confirm city", code: "city_confirmation_required" }, city_suggestion: suggestion };

test("API errors preserve the structured city suggestion", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(payload), {
    status: 409, headers: { "Content-Type": "application/json" },
  }));
  await expect(request("/me/location", { method: "PUT" })).rejects.toMatchObject({ status: 409, payload });
});

test("a valid suggestion is exposed without an automatic manual save", async () => {
  const save = vi.spyOn(api.profile, "setLocation").mockRejectedValue(new ApiError(409, "Confirm city", payload));
  await expect(saveDetectedLocation(32.22, -7.94)).rejects.toBeInstanceOf(CityConfirmationRequired);
  expect(save).toHaveBeenCalledTimes(1);
});

test.each([null, { ...payload, city_suggestion: { city: 42 } }])("malformed suggestions keep the original error", async (body) => {
  const error = new ApiError(409, "Invalid suggestion", body);
  vi.spyOn(api.profile, "setLocation").mockRejectedValue(error);
  await expect(saveDetectedLocation(32.22, -7.94)).rejects.toBe(error);
});

test.each(["confirm", "cancel"])("form city %s requires an explicit choice", async (choice) => {
  vi.spyOn(locationUtils, "lookupNetworkLocation").mockResolvedValue({ latitude: 32.22, longitude: -7.94, label: "Test location" });
  const save = vi.spyOn(api.profile, "setLocation")
    .mockRejectedValueOnce(new ApiError(409, "Confirm city", payload))
    .mockResolvedValue({ city: suggestion.city, country_code: "MA", area: null, location_source: "manual" });
  const onSaved = vi.fn();
  render(<LocationForm current={user} onSaved={onSaved} />);
  await userEvent.click(screen.getByRole("tab", { name: "Use device location" }));
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Use approximate location" }));
  const confirm = await screen.findByRole("button", { name: "Use Ben Guerir as my approximate location" });
  expect(save).toHaveBeenCalledTimes(1);
  expect(onSaved).not.toHaveBeenCalled();
  await userEvent.click(choice === "confirm" ? confirm : screen.getByRole("button", { name: "Cancel" }));
  if (choice === "confirm") {
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenLastCalledWith({ source: "manual", confirmation_token: suggestion.confirmation_token });
    expect(screen.getByText("Added manually", { exact: false })).toBeTruthy();
  } else {
    expect(save).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  }
  expect(screen.queryByRole("button", { name: "Use Ben Guerir as my approximate location" })).toBeNull();
});


test.each(["confirm", "cancel"])("map city %s requires an explicit choice", async (choice) => {
  vi.spyOn(locationUtils, "lookupNetworkLocation").mockResolvedValue({ latitude: 32.22, longitude: -7.94, label: "Test location" });
  const save = vi.spyOn(api.profile, "setLocation")
    .mockRejectedValueOnce(new ApiError(409, "Confirm city", payload))
    .mockResolvedValue({ city: suggestion.city, country_code: "MA", area: null, location_source: "manual" });
  render(<PlacesMap />);
  await userEvent.click(screen.getByRole("button", { name: "Use approximate location" }));
  await userEvent.click(await screen.findByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: "Save as my location" }));
  const confirm = await screen.findByRole("button", { name: "Use Ben Guerir as my approximate location" });
  expect(save).toHaveBeenCalledTimes(1);
  await userEvent.click(choice === "confirm" ? confirm : screen.getByRole("button", { name: "Cancel" }));
  if (choice === "confirm") {
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenLastCalledWith({ source: "manual", confirmation_token: suggestion.confirmation_token });
  } else expect(save).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Use Ben Guerir as my approximate location" })).toBeNull();
});
