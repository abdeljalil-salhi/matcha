import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
import { api } from "../src/api";
import type { MapProfile } from "../src/api/types/userMap";
import { UsersMap } from "../src/components/map/UsersMap";
import { MapMemberCard } from "../src/components/map/MapMemberCard";

const people: MapProfile[] = [
  { id: 1, username: "abdeels", first_name: "Abdeljalil", last_name: "Salhi", age: 22,
    city: "Ben Guerir ابن جرير", area: null, country_code: "MA", photo_id: 1,
    latitude: 32.22, longitude: -7.94, fame: 20, is_demo: false, tags: ["art"] },
  { id: 2, username: "karim", first_name: "Karim", last_name: "Petit", age: 29,
    city: "Marrakesh", area: null, country_code: "MA", photo_id: 2,
    latitude: 31.63, longitude: -8, fame: 10, is_demo: true, tags: ["books"] },
];
vi.mock("../src/context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../src/components/map/useMapProfiles", () => ({
  useMapProfiles: () => ({ profiles: people, loading: false, error: null, limited: false, retry: vi.fn() }),
}));
vi.mock("../src/components/map/UserMapCanvas", () => ({
  UserMapCanvas: ({ onSelect, selectedId }: { onSelect: (profiles: MapProfile[]) => void; selectedId?: number }) =>
    <><button onClick={() => onSelect([people[0]!])}>Select area</button>
      {selectedId === 1 ? <MapMemberCard person={people[0]!} /> : null}</>,
}));

test("map cards use a compact action and retain accessible full names and multilingual locations", () => {
  const { container } = render(<MemoryRouter><MapMemberCard person={people[0]!} /></MemoryRouter>);
  const link = screen.getByRole("link", { name: "View Abdeljalil Salhi's profile" });
  expect(link.textContent?.trim()).toBe("View profile");
  expect(link.getAttribute("href")).toBe("/profile/1");
  expect(screen.getByText("Ben Guerir ابن جرير").tagName).toBe("BDI");
  expect(container.querySelector(".user-map__portrait")).toBeTruthy();
});

test("sidebar selections stay in the compact list and see-all clears the selection", async () => {
  vi.spyOn(api.userMap, "settings").mockResolvedValue({ map_visible: false, center: null });
  render(<MemoryRouter><UsersMap /></MemoryRouter>);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Select area" }));
  expect(screen.getByRole("heading", { name: "People nearby" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Show Abdeljalil Salhi on the map" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getAllByRole("link", { name: "View Karim Petit's profile" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "See all on map (2)" }));
  expect(screen.getByRole("button", { name: "Show Abdeljalil Salhi on the map" }).getAttribute("aria-pressed")).toBe("false");
});

test("filters update sidebar members and reset restores the viewport list", async () => {
  vi.spyOn(api.userMap, "settings").mockResolvedValue({ map_visible: false, center: null });
  render(<MemoryRouter><UsersMap /></MemoryRouter>);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Filter people" }));
  fireEvent.change(screen.getByLabelText("Maximum age"), { target: { value: "25" } });
  expect(screen.queryByRole("link", { name: "View Karim Petit's profile" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
  expect(screen.getByRole("link", { name: "View Karim Petit's profile" })).toBeTruthy();
});


test("quick filters use individual dropdowns and more filters opens the full dialog", async () => {
  vi.spyOn(api.userMap, "settings").mockResolvedValue({ map_visible: false, center: null });
  render(<MemoryRouter><UsersMap /></MemoryRouter>);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Age" }));
  expect(screen.getByRole("dialog", { name: "Filter by age" })).toBeTruthy();
  expect(screen.queryByRole("dialog", { name: "Filter people" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Maximum age"), { target: { value: "25" } });
  expect(screen.queryByRole("link", { name: "View Karim Petit's profile" })).toBeNull();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.getByRole("button", { name: "Age" }).getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "Interests" }));
  expect(screen.getByRole("dialog", { name: "Filter by interests" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Interests"), { target: { value: "art" } });
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Distance" }));
  expect(screen.getByRole("dialog", { name: "Filter by distance" })).toBeTruthy();
  expect((screen.getByLabelText("Distance from your saved area") as HTMLSelectElement).disabled).toBe(true);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "More filters" }));
  expect(screen.getByRole("dialog", { name: "Filter people" })).toBeTruthy();
  expect((screen.getByLabelText("Interests") as HTMLSelectElement).value).toBe("art");
});
