import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { Notification } from "../src/api";
import { useReadMessages } from "../src/pages/chat/useReadMessages";
import { message } from "./fixtures";

const context = vi.hoisted(() => ({ notifications: [] as Notification[], markOne: vi.fn() }));
vi.mock("../src/context/NotificationsContext", () => ({ useNotifications: () => context }));
afterEach(() => { vi.useRealTimers(); context.notifications = []; });
const entry = (overrides: Partial<Notification> = {}): Notification => ({
  id: 10, actor_id: 2, actor_username: "bob", unread_count: 1, kind: "message", message_id: message.id,
  created_at: message.created_at, read_at: null, ...overrides,
});

test("only loaded incoming messages in this conversation are acknowledged", async () => {
  context.markOne.mockResolvedValue(undefined);
  context.notifications = [entry(), entry({ id: 11, actor_id: 3 }),
    entry({ id: 12, kind: "like", message_id: null }), entry({ id: 13, message_id: 99 }),
    entry({ id: 14, read_at: message.created_at })];
  renderHook(() => useReadMessages(2, [message], true));
  await act(async () => {});
  expect(context.markOne).toHaveBeenCalledExactlyOnceWith(10);
});

test("late notifications and late messages are acknowledged after both are loaded", async () => {
  context.markOne.mockClear().mockResolvedValue(undefined);
  const { rerender } = renderHook(({ messages }) => useReadMessages(2, messages, true), {
    initialProps: { messages: [message] },
  });
  await act(async () => {});
  expect(context.markOne).not.toHaveBeenCalled();
  context.notifications = [entry()];
  rerender({ messages: [message] });
  await act(async () => {});
  expect(context.markOne).toHaveBeenCalledExactlyOnceWith(10);
  context.notifications = [entry({ id: 11, message_id: 2 })];
  rerender({ messages: [message] });
  await act(async () => {});
  expect(context.markOne).toHaveBeenCalledTimes(1);
  rerender({ messages: [message, { ...message, id: 2 }] });
  await act(async () => {});
  expect(context.markOne).toHaveBeenLastCalledWith(11);
});

test("hidden conversations stay unread until the tab becomes visible", async () => {
  context.markOne.mockClear().mockResolvedValue(undefined);
  context.notifications = [entry()];
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  renderHook(() => useReadMessages(2, [message], true));
  await act(async () => {});
  expect(context.markOne).not.toHaveBeenCalled();
  visibility.mockReturnValue("visible");
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(context.markOne).toHaveBeenCalledExactlyOnceWith(10);
});

test("reading older history does not acknowledge new messages until returning to the bottom", async () => {
  context.markOne.mockClear().mockResolvedValue(undefined);
  context.notifications = [entry()];
  const { rerender } = renderHook(({ enabled }) => useReadMessages(2, [message], enabled), {
    initialProps: { enabled: false },
  });
  await act(async () => {});
  expect(context.markOne).not.toHaveBeenCalled();
  rerender({ enabled: true });
  await act(async () => {});
  expect(context.markOne).toHaveBeenCalledExactlyOnceWith(10);
});

test("failed acknowledgements retry on the polling cadence without duplicate in-flight requests", async () => {
  vi.useFakeTimers();
  context.markOne.mockClear().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(undefined);
  context.notifications = [entry()];
  const { unmount } = renderHook(() => useReadMessages(2, [message], true));
  await act(async () => {});
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(context.markOne).toHaveBeenCalledTimes(1);
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(context.markOne).toHaveBeenCalledTimes(2);
  unmount();
  await act(async () => vi.advanceTimersByTimeAsync(4000));
  expect(context.markOne).toHaveBeenCalledTimes(2);
});

test("a slow acknowledgement is sent only once while in flight", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  context.markOne.mockClear().mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  context.notifications = [entry()];
  renderHook(() => useReadMessages(2, [message], true));
  await act(async () => vi.advanceTimersByTimeAsync(6000));
  expect(context.markOne).toHaveBeenCalledTimes(1);
  await act(async () => finish());
});
