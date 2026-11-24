import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { planApi } from "../src/api/plans";
import type { DatePlan } from "../src/api/types/plans";
import { CalendarPage } from "../src/pages/CalendarPage";
import { AppShell } from "../src/components/layout/AppShell";
import { user } from "./fixtures";

vi.mock("../src/context/AuthContext", () => ({ useAuth: () => ({ user }) }));
vi.mock("../src/context/NotificationsContext", () => ({
  useNotifications: () => ({ notifications: [], unread: { total: 0, messages: 0 } }),
}));
vi.mock("../src/components/layout/SessionActions", () => ({ SessionActions: () => null }));

const plan: DatePlan = {
  id: 5, creator_id: 1, partner_id: 2, proposed_by: 2, other_id: 2,
  partner_first_name: "Bob", partner_last_name: "Example", title: "Coffee together",
  starts_at: new Date(2030, 4, 15, 18, 30).toISOString(), timezone: "Europe/Paris",
  venue: "Central café", notes: "By the entrance", state: "accepted", version: 2,
  updated_by: 1, cancellation_reason: null,
  created_at: "2030-05-01T00:00:00Z", updated_at: "2030-05-01T00:00:00Z",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2030, 4, 10, 12));
});
afterEach(() => vi.useRealTimers());

async function showCalendar() {
  render(<MemoryRouter><CalendarPage /></MemoryRouter>);
  await act(async () => {});
}

function dayButton(day: number, month = 4) {
  const label = new Date(2030, month, day).toLocaleDateString(undefined, { dateStyle: "full" });
  return screen.getByRole("button", { name: new RegExp(`^${label},`) });
}

test("calendar loads all pages, marks days and filters the month's plans", async () => {
  const later = { ...plan, id: 6, title: "Museum visit", starts_at: new Date(2030, 4, 20, 15).toISOString(), state: "proposed" as const };
  vi.spyOn(planApi, "upcoming").mockResolvedValueOnce({ plans: [plan], has_more: true })
    .mockResolvedValue({ plans: [later], has_more: false });
  await showCalendar();
  expect(planApi.upcoming).toHaveBeenNthCalledWith(2, 1, expect.any(AbortSignal));
  expect(screen.getByText("Coffee together")).toBeTruthy();
  expect(screen.getByText("Museum visit")).toBeTruthy();
  fireEvent.click(dayButton(15));
  expect(dayButton(15).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("Coffee together")).toBeTruthy();
  expect(screen.queryByText("Museum visit")).toBeNull();
  expect(screen.getByRole("link", { name: "Open date planner" }).getAttribute("href")).toBe("/chat/2?plans=1");
  fireEvent.click(screen.getByRole("button", { name: "Show month" }));
  expect(screen.getByText("Museum visit")).toBeTruthy();
});

test("month navigation shows the right plans and Today returns to this month", async () => {
  vi.spyOn(planApi, "upcoming").mockResolvedValue({ plans: [plan,
    { ...plan, id: 6, title: "June picnic", starts_at: new Date(2030, 5, 2, 15).toISOString() }], has_more: false });
  await showCalendar();
  fireEvent.click(screen.getByRole("button", { name: "Next month" }));
  expect(screen.getByText("June picnic")).toBeTruthy();
  expect(screen.queryByText("Coffee together")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Today" }));
  expect(screen.getByText("Coffee together")).toBeTruthy();
  expect(dayButton(10).getAttribute("aria-current")).toBe("date");
});

test("remote cancellations clear calendar days on the chat refresh cycle", async () => {
  vi.spyOn(planApi, "upcoming").mockResolvedValue({ plans: [plan], has_more: false });
  await showCalendar();
  vi.mocked(planApi.upcoming).mockResolvedValue({ plans: [], has_more: false });
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(screen.queryByText("Coffee together")).toBeNull();
  expect(dayButton(15).getAttribute("aria-label")).toContain("0 plans");
  expect(screen.getByText("Your calendar has room.")).toBeTruthy();
});

test("loading errors can be retried", async () => {
  vi.spyOn(planApi, "upcoming").mockRejectedValue(new Error("Offline"));
  await showCalendar();
  expect(screen.getByRole("alert").textContent).toContain("Offline");
  vi.mocked(planApi.upcoming).mockResolvedValue({ plans: [plan], has_more: false });
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await act(async () => {});
  expect(screen.getByText("Coffee together")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("account dropdown places Calendar directly below My profile and closes on selection", () => {
  render(<MemoryRouter><AppShell /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
  const profile = screen.getByRole("link", { name: "My profile" });
  const calendar = screen.getByRole("link", { name: "Calendar" });
  expect(profile.nextElementSibling).toBe(calendar);
  expect(calendar.getAttribute("href")).toBe("/calendar");
  fireEvent.click(calendar);
  expect(screen.queryByRole("link", { name: "Calendar" })).toBeNull();
});
