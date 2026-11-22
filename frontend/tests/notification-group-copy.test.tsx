import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { expect, test, vi } from "vitest";
import type { Notification } from "../src/api";
import { NotificationMenu } from "../src/components/layout/NotificationMenu";
import { NotificationsPage } from "../src/pages/NotificationsPage";
import { notificationCopy, notificationKey } from "../src/data/notifications";

const { markOne } = vi.hoisted(() => ({ markOne: vi.fn().mockResolvedValue(undefined) }));
const notifications: Notification[] = [
  { id: 10, actor_id: 2, actor_username: "bob", kind: "message", message_id: 10, unread_count: 3,
    created_at: "2026-11-23T00:00:00Z", read_at: null },
  { id: 9, actor_id: 2, actor_username: "bob", kind: "visit", message_id: null, unread_count: 4,
    created_at: "2026-11-23T00:00:00Z", read_at: null },
];
vi.mock("../src/context/NotificationsContext", () => ({ useNotifications: () => ({
  notifications, unread: { total: 2, messages: 3 }, hasMore: false, markOne,
  snapshotVisible: vi.fn(), markAllRead: vi.fn(),
}) }));
function Location() { return <output>{useLocation().pathname}</output>; }

test.each(["menu", "page"])("%s groups message and visit copy and defers message reads until chat loads", async (surface) => {
  markOne.mockClear();
  render(<MemoryRouter>{surface === "menu" ? <NotificationMenu /> : <NotificationsPage />}<Location /></MemoryRouter>);
  if (surface === "menu") await userEvent.click(screen.getByRole("button", { name: "Notifications, 2 unread" }));
  expect(screen.getByRole("button", { name: /bob.*your profile 4 times/ })).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: /bob sent you 3 new messages/ }));
  expect(markOne).not.toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toBe("/chat/2");
});

test.each(["menu", "page"])("%s acknowledges a visit group when it is selected", async (surface) => {
  markOne.mockClear();
  render(<MemoryRouter>{surface === "menu" ? <NotificationMenu /> : <NotificationsPage />}<Location /></MemoryRouter>);
  if (surface === "menu") await userEvent.click(screen.getByRole("button", { name: "Notifications, 2 unread" }));
  await userEvent.click(screen.getByRole("button", { name: /bob.*your profile 4 times/ }));
  expect(markOne).toHaveBeenCalledExactlyOnceWith(9);
  expect(screen.getByRole("status").textContent).toBe("/profile/2");
});

test("read history has no stale new-event count, and keys are stable per actor/type", () => {
  expect(notificationCopy({ ...notifications[0]!, unread_count: 0, read_at: "2026-11-23" }, "menu"))
    .toBe("sent you a message");
  expect(notificationKey({ ...notifications[0]!, id: 100 })).toBe(notificationKey(notifications[0]!));
  expect(notificationKey(notifications[1]!)).not.toBe(notificationKey(notifications[0]!));
});
