import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
import { api, type DiscoveryProfile } from "../src/api";
import { DiscoveryView } from "../src/pages/discovery/DiscoveryView";
import { user } from "./fixtures";

vi.mock("../src/context/AuthContext", () => ({ useAuth: () => ({ user: { ...user, photos: [{ id: 1, is_primary: true }] } }) }));
vi.mock("../src/context/ToastContext", () => ({ useToast: () => ({ notify: vi.fn() }) }));
const profile: DiscoveryProfile = {
  id: 2, username: "bob", first_name: "Bob", last_name: "Example", age: 25,
  gender: "man", city: "Paris", area: "Montmartre", country_code: "FR", fame: 42,
  photo_id: 5, tags: ["art", "books", "gaming"], common_tags: 1, distance_km: 12, is_demo: false,
};
function open(mode: "suggestions" | "search" = "suggestions") {
  vi.spyOn(api.profile, "tags").mockResolvedValue({ tags: ["art", "books", "climbing", "coding", "cycling", "music"] });
  const suggestions = vi.spyOn(api.discovery, "suggestions").mockResolvedValue({ profiles: [profile] });
  const search = vi.spyOn(api.discovery, "search").mockResolvedValue({ profiles: [profile] });
  render(<MemoryRouter><DiscoveryView mode={mode} /></MemoryRouter>);
  return { suggestions, search };
}

test("New here and discovery shortcuts request their real server ordering", async () => {
  const { suggestions } = open();
  await screen.findByText("Bob Example, 25");
  expect(screen.queryByTitle("Email verified")).toBeNull();
  expect(screen.getByRole("option", { name: "Anywhere" })).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "New here" }));
  await waitFor(() => expect(suggestions).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "newest", offset: 0 })));
  await userEvent.click(screen.getByRole("button", { name: "Nearby" }));
  await waitFor(() => expect(suggestions).toHaveBeenLastCalledWith(expect.objectContaining({ sort: "location" })));
  fireEvent.change(screen.getByRole("combobox", { name: "Quick maximum distance" }), { target: { value: "50" } });
  await waitFor(() => expect(suggestions).toHaveBeenLastCalledWith(expect.objectContaining({ max_distance_km: 50 })));
  fireEvent.change(screen.getByRole("combobox", { name: "Quick maximum distance" }), { target: { value: "" } });
  await waitFor(() => expect(suggestions.mock.calls.at(-1)?.[0]).not.toHaveProperty("max_distance_km"));
});

test("interest search finds selectable tags and like feedback stays correct", async () => {
  open();
  const like = vi.spyOn(api.relationships, "like").mockResolvedValue({ connected: false });
  await screen.findByText("Bob Example, 25");
  await userEvent.type(screen.getByRole("textbox", { name: "Find interest tags" }), "book");
  await userEvent.click(screen.getByRole("button", { name: "#books" }));
  expect(screen.getByRole("button", { name: "#books" }).getAttribute("aria-pressed")).toBe("true");
  await userEvent.click(screen.getByRole("button", { name: "Like" }));
  expect(like).toHaveBeenCalledWith(2);
  expect((await screen.findByRole("button", { name: "Liked" }) as HTMLButtonElement).disabled).toBe(true);
});

test("range sliders prevent inverted bounds and search remains explicitly submitted", async () => {
  const { search } = open("search");
  await screen.findByText("Bob Example, 25");
  fireEvent.change(screen.getByRole("slider", { name: "Minimum age" }), { target: { value: "90" } });
  fireEvent.change(screen.getByRole("slider", { name: "Maximum age" }), { target: { value: "50" } });
  expect(search).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole("button", { name: "Search profiles" }));
  await waitFor(() => expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ min_age: 90, max_age: 90 })));
  const toggle = screen.getByRole("button", { name: "Refine results" });
  await userEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
});
