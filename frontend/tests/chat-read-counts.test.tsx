import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, test, vi } from "vitest";
import { api, type Notification } from "../src/api";
import { NotificationsProvider, useNotifications } from "../src/context/NotificationsContext";
import { ChatPage } from "../src/pages/chat/ChatPage";
import { conversation, message, user } from "./fixtures";

vi.mock("../src/context/AuthContext", () => ({ useAuth: () => ({ user }) }));
vi.mock("../src/context/ToastContext", () => ({ useToast: () => ({ notify: vi.fn() }) }));

function Counts() {
  const { unread } = useNotifications();
  return <output>{unread.messages} messages, {unread.total} notifications</output>;
}

test("opening a chat clears its badge and global message count without consuming other notifications", async () => {
  const notifications: Notification[] = [2].map((id) => ({
    id, actor_id: 2, actor_username: "bob", unread_count: 2, kind: "message", message_id: id,
    read_at: null, created_at: message.created_at,
  }));
  notifications.push({ ...notifications[0]!, id: 3, unread_count: 1, actor_id: 3, actor_username: "charlie", message_id: 3 });
  notifications.push({ ...notifications[0]!, id: 4, unread_count: 1, kind: "like", message_id: null });
  vi.spyOn(api.notifications, "list").mockImplementation(async () => ({
    notifications: notifications.map((item) => ({ ...item })),
    unread: {
      total: notifications.filter((item) => !item.read_at).length,
      messages: notifications.filter((item) => item.kind === "message" && !item.read_at).reduce((sum, item) => sum + item.unread_count, 0),
    },
  }));
  const markRead = vi.spyOn(api.notifications, "markRead").mockImplementation(async (id) => {
    notifications.find((item) => item.id === id)!.read_at = message.created_at;
  });
  vi.spyOn(api.notifications, "presence").mockResolvedValue(undefined);
  vi.spyOn(api.chat, "conversations").mockResolvedValue({ conversations: [conversation] });
  vi.spyOn(api.chat, "messages").mockResolvedValue({ messages: [message, { ...message, id: 2 }] });
  render(<MemoryRouter initialEntries={["/chat/2"]}>
    <NotificationsProvider><Counts /><Routes><Route path="/chat/:id" element={<ChatPage />} /></Routes></NotificationsProvider>
  </MemoryRouter>);
  await act(async () => {});
  expect(screen.getByText("1 messages, 2 notifications")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Mark 2 read" })).toBeNull();
  expect(screen.queryByLabelText("2 unread messages")).toBeNull();
  expect(markRead.mock.calls.map(([id]) => id).sort()).toEqual([2]);
  expect(notifications[1]!.read_at).toBeNull();
  expect(notifications[2]!.read_at).toBeNull();
});
