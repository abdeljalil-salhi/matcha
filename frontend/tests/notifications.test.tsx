import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "../src/api";
import { NotificationsProvider, useNotifications } from "../src/context/NotificationsContext";
import { user } from "./fixtures";

vi.mock("../src/context/AuthContext", () => ({ useAuth: () => ({ user }) }));
afterEach(() => vi.useRealTimers());

function UnreadCount() {
  const { unread } = useNotifications();
  return <output>{unread.messages} unread messages</output>;
}

test("notification polling continues while hidden without claiming online presence", async () => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  const presence = vi.spyOn(api.notifications, "presence").mockResolvedValue(undefined);
  vi.spyOn(api.notifications, "list")
    .mockResolvedValueOnce({ unread: { total: 0, messages: 0 }, notifications: [] })
    .mockResolvedValue({ unread: { total: 1, messages: 1 }, notifications: [] });
  render(<NotificationsProvider><UnreadCount /></NotificationsProvider>);
  await act(async () => {});
  expect(screen.getByText("0 unread messages")).toBeTruthy();
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(screen.getByText("1 unread messages")).toBeTruthy();
  expect(presence).not.toHaveBeenCalled();
});
