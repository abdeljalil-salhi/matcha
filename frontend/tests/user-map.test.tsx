import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import L from "leaflet";
import { api } from "../src/api";
import type { MapBounds, MapProfile, MapProfilePage } from "../src/api/types/userMap";
import { MapSharing } from "../src/components/map/MapSharing";
import { UserMapCanvas, publicBounds } from "../src/components/map/UserMapCanvas";
import { useMapProfiles } from "../src/components/map/useMapProfiles";

const bounds: MapBounds = { west: -180, east: 180, south: -90, north: 90 };
const person: MapProfile = { id: 2, username: "bob", first_name: "Bob", last_name: "Example",
  age: 30, city: "Paris", area: null, country_code: "FR", photo_id: 3, latitude: 48.86, longitude: 2.35, fame: 10, is_demo: false };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test("map sharing is separate and saves only when the user toggles it", async () => {
  const share = vi.spyOn(api.userMap, "share").mockResolvedValue({ map_visible: true, center: null });
  const onSaved = vi.fn();
  render(<MapSharing settings={{ map_visible: false, center: null }} onSaved={onSaved} />);
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  expect(share).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox"));
  await act(async () => {});
  expect(share).toHaveBeenCalledExactlyOnceWith(true);
  expect(onSaved).toHaveBeenCalledWith({ map_visible: true, center: null });
});

test("map sharing can be revoked and failed requests preserve the saved state", async () => {
  const share = vi.spyOn(api.userMap, "share").mockRejectedValue(new Error("Offline"));
  const onSaved = vi.fn();
  render(<MapSharing settings={{ map_visible: true, center: null }} onSaved={onSaved} />);
  fireEvent.click(screen.getByRole("checkbox"));
  await act(async () => {});
  expect(share).toHaveBeenCalledExactlyOnceWith(false);
  expect(onSaved).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toBe("Offline");
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
});

test("map API opts in with explicit consent and revokes without changing matching location", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ map_visible: true, center: null }), {
    headers: { "Content-Type": "application/json" },
  }));
  await api.userMap.share(true);
  expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toEqual({ map_visible: true, consent: true });
  await api.userMap.share(false);
  expect(JSON.parse(fetch.mock.calls[1]![1]!.body as string)).toEqual({ map_visible: false });
});

test("viewport pagination fetches every bounded page", async () => {
  vi.useFakeTimers();
  const request = vi.spyOn(api.userMap, "profiles")
    .mockResolvedValueOnce({ profiles: [person], has_more: true, next_after: 2 })
    .mockResolvedValueOnce({ profiles: [{ ...person, id: 3 }], has_more: false, next_after: null });
  const { result } = renderHook(() => useMapProfiles(bounds));
  await act(async () => vi.advanceTimersByTimeAsync(250));
  expect(request.mock.calls.map((call) => call[1])).toEqual([0, 2]);
  expect(result.current.profiles.map((profile) => profile.id)).toEqual([2, 3]);
  expect(result.current.limited).toBe(false);
});

test("panning aborts an old viewport and cannot reintroduce stale profiles", async () => {
  vi.useFakeTimers();
  let old!: (page: MapProfilePage) => void;
  const request = vi.spyOn(api.userMap, "profiles")
    .mockReturnValueOnce(new Promise((resolve) => { old = resolve; }))
    .mockResolvedValue({ profiles: [{ ...person, id: 3 }], has_more: false, next_after: null });
  const { result, rerender } = renderHook(({ view }) => useMapProfiles(view), { initialProps: { view: bounds } });
  await act(async () => vi.advanceTimersByTimeAsync(250));
  rerender({ view: { ...bounds, west: 0 } });
  expect(request.mock.calls[0]![2]!.aborted).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(250));
  await act(async () => old({ profiles: [person], has_more: false, next_after: null }));
  expect(result.current.profiles.map((profile) => profile.id)).toEqual([3]);
});

test("public viewport bounds round outwards and preserve dateline crossings", () => {
  const map = { getBounds: () => L.latLngBounds([48.881234, 2.341234], [48.889876, 2.349876]) } as L.Map;
  expect(publicBounds(map)).toEqual({ south: 48.88, north: 48.89, west: 2.34, east: 2.35 });
  const dateline = { getBounds: () => L.latLngBounds([-10, 170], [10, 190]) } as L.Map;
  expect(publicBounds(dateline)).toEqual({ south: -10, north: 10, west: 170, east: -170 });
});

test("denied device GPS shows an error without saving or sharing a location", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const getCurrentPosition = vi.fn((_success, failure) => failure({ code: 1 }));
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition }, onLine: true });
  const save = vi.spyOn(api.profile, "setLocation");
  const share = vi.spyOn(api.userMap, "share");
  render(<MemoryRouter><UserMapCanvas center={null} profiles={[]} onBounds={vi.fn()} onSelect={vi.fn()} /></MemoryRouter>);
  expect(getCurrentPosition).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Center on my device" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
  expect(share).not.toHaveBeenCalled();
});

test("a cluster zooms and separates shared points without selecting a profile", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.spyOn(L.Map.prototype, "getSize").mockImplementation(() => L.point(800, 600));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const previous = L.Browser.svg;
  Object.defineProperty(L.Browser, "svg", { value: true, configurable: true });
  try {
    const onSelect = vi.fn();
    const people = [person, { ...person, id: 3, first_name: "Charlie" }];
    const { container } = render(<UserMapCanvas center={person} profiles={people} onBounds={vi.fn()} onSelect={onSelect} />);
    const cluster = await screen.findByText("2");
    fireEvent.click(cluster);
    await act(async () => {});
    expect(onSelect).not.toHaveBeenCalled();
    await waitFor(() => expect(container.querySelectorAll(".user-map-pin")).toHaveLength(2), { timeout: 2500 });
    fireEvent.click(screen.getByRole("button", { name: "View Bob Example on the map" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith([person]);
  } finally { Object.defineProperty(L.Browser, "svg", { value: previous, configurable: true }); }
});

test("device centering keeps precise GPS local and sends only coarse viewport bounds", async () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const precise = { latitude: 48.8867123, longitude: 2.3431123 };
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: (success: PositionCallback) => success({ coords: precise } as GeolocationPosition) }, onLine: true });
  const previous = L.Browser.svg;
  Object.defineProperty(L.Browser, "svg", { value: true, configurable: true });
  try {
    const onBounds = vi.fn();
    const save = vi.spyOn(api.profile, "setLocation");
    const share = vi.spyOn(api.userMap, "share");
    render(<UserMapCanvas center={null} profiles={[]} onBounds={onBounds} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Center on my device" }));
    const last = onBounds.mock.calls.at(-1)![0] as MapBounds;
    expect(last).toEqual({ west: 2.34, east: 2.35, south: 48.88, north: 48.89 });
    expect(save).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
  } finally { Object.defineProperty(L.Browser, "svg", { value: previous, configurable: true }); }
});


test("selecting one marker opens only its card and closing the popup clears selection", async () => {
  vi.spyOn(L.Map.prototype, "getSize").mockImplementation(() => L.point(375, 500));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const people = [person, { ...person, id: 3, first_name: "Charlie", longitude: 2.5 }];
  const onBounds = vi.fn();
  function Harness() {
    const [selected, select] = useState<MapProfile[]>([]);
    return <UserMapCanvas center={person} profiles={people} onBounds={onBounds} onSelect={select} selectedId={selected[0]?.id} />;
  }
  const { container } = render(<MemoryRouter><Harness /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "View Bob Example on the map" }));
  expect(await screen.findByRole("region", { name: "Bob Example on the map" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "View Bob Example's profile" }).getAttribute("href")).toBe("/profile/2");
  expect(container.querySelectorAll(".user-map-popup")).toHaveLength(1);
  expect(screen.queryByRole("link", { name: "View Charlie Example's profile" })).toBeNull();
  fireEvent.click(container.querySelector(".leaflet-popup-close-button")!);
  expect(screen.queryByRole("region", { name: "Bob Example on the map" })).toBeNull();
});
