import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { LocationForm } from "../src/components/profile/LocationForm";
import { user } from "./fixtures";

vi.mock("../src/context/AuthContext", () => ({ useAuth: () => ({ patchUser: vi.fn() }) }));

test("location attribution is visible in both manual and consented GPS modes", async () => {
  render(<LocationForm current={user} onSaved={vi.fn()} />);
  const link = screen.getByRole("link", { name: "OpenStreetMap contributors" });
  expect(link.getAttribute("href")).toBe("https://www.openstreetmap.org/copyright");
  await userEvent.click(screen.getByRole("tab", { name: "Use device location" }));
  expect(screen.getByRole("link", { name: "OpenStreetMap contributors" })).toBeTruthy();
  expect(screen.getByText(/Online lookups send coordinates to our geocoding provider/)).toBeTruthy();
});
