import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { api, type Notification, type NotificationPage } from "../src/api";
import { NotificationsProvider, useNotifications } from "../src/context/NotificationsContext";
import { user } from "./fixtures";

vi.mock("../src/context/AuthContext", () => ({ useAuth: () => ({ user }) }));
afterEach(() => vi.useRealTimers());
const group = (id: number, unread_count: number): Notification => ({
  id, actor_id: 2, actor_username: "bob", kind: "message", message_id: id,
  created_at: "2026-11-23T00:00:00Z", read_at: null, unread_count,
});
const page = (id: number, count: number): NotificationPage => ({
  notifications: [group(id, count)], unread: { total: count ? 1 : 0, messages: count },
});

function Probe() {
  const { notifications, unread, markOne, loadOlder, refresh } = useNotifications();
  return <>
    <output>{JSON.stringify({ notifications, unread })}</output>
    <button onClick={() => { void markOne(10); void markOne(10); }}>Read snapshot</button>
    <button onClick={() => void loadOlder()}>Older</button>
    <button onClick={() => void refresh()}>Refresh</button>
  </>;
}

function state(): NotificationPage { return JSON.parse(screen.getByRole("status").textContent!); }
function mount() {
  vi.spyOn(api.notifications, "presence").mockResolvedValue(undefined);
  render(<NotificationsProvider><Probe /></NotificationsProvider>);
}

test("older pages and polling replace message groups without duplicate or older representatives", async () => {
  vi.spyOn(api.notifications, "list").mockResolvedValueOnce(page(10, 3))
    .mockResolvedValueOnce(page(5, 3)).mockResolvedValue(page(12, 4));
  mount();
  await act(async () => {});
  await userEvent.click(screen.getByRole("button", { name: "Older" }));
  expect(state().notifications.map((item) => item.id)).toEqual([10]);
  await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(state().notifications.map((item) => item.id)).toEqual([12]);
  expect(state().notifications[0]!.unread_count).toBe(4);
});

test("a message arriving during acknowledgement remains unread and duplicate writes are suppressed", async () => {
  vi.spyOn(api.notifications, "list").mockResolvedValueOnce(page(10, 3)).mockResolvedValueOnce(page(11, 4)).mockResolvedValue(page(11, 1));
  let finish!: () => void;
  const write = vi.spyOn(api.notifications, "markRead").mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  mount();
  await act(async () => {});
  await userEvent.click(screen.getByRole("button", { name: "Read snapshot" }));
  expect(write).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await act(async () => finish());
  expect(state().unread).toEqual({ total: 1, messages: 1 });
  expect(state().notifications[0]).toMatchObject({ id: 11, read_at: null, unread_count: 1 });
});

test("an older in-flight poll cannot resurrect successfully read messages", async () => {
  let finishPoll!: (value: NotificationPage) => void;
  vi.spyOn(api.notifications, "list").mockResolvedValueOnce(page(10, 3))
    .mockReturnValueOnce(new Promise((resolve) => { finishPoll = resolve; }));
  vi.spyOn(api.notifications, "markRead").mockResolvedValue(undefined);
  mount();
  await act(async () => {});
  await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await userEvent.click(screen.getByRole("button", { name: "Read snapshot" }));
  await act(async () => finishPoll(page(10, 3)));
  expect(state().unread).toEqual({ total: 0, messages: 0 });
  expect(state().notifications[0]).toMatchObject({ unread_count: 0 });
  expect(state().notifications[0]!.read_at).not.toBeNull();
});

test("reading a repeated visit clears one bell row without subtracting unread messages", async () => {
  vi.spyOn(api.notifications, "list").mockResolvedValue({
    notifications: [{ ...group(10, 4), kind: "visit", message_id: null }, group(9, 3)],
    unread: { total: 2, messages: 3 },
  });
  vi.spyOn(api.notifications, "markRead").mockResolvedValue(undefined);
  mount();
  await act(async () => {});
  await userEvent.click(screen.getByRole("button", { name: "Read snapshot" }));
  expect(state().unread).toEqual({ total: 1, messages: 3 });
  expect(state().notifications[0]!.unread_count).toBe(0);
  expect(state().notifications[1]!.unread_count).toBe(3);
});
