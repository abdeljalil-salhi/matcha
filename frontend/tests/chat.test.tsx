import { planApi } from "../src/api/plans";
import type { DatePlan } from "../src/api/types/plans";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { api } from "../src/api";
import { ChatThread } from "../src/pages/chat/ChatThread";
import { conversation, message, user } from "./fixtures";

vi.mock("../src/context/AuthContext", () => ({ useAuth: () => ({ user }) }));
vi.mock("../src/context/ToastContext", () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock("../src/context/NotificationsContext", () => ({
  useNotifications: () => ({ notifications: [], markOne: vi.fn() }),
}));

afterEach(() => vi.useRealTimers());

test("an open empty chat receives its first message without sending or reloading", async () => {
  vi.useFakeTimers();
  vi.spyOn(api.chat, "messages")
    .mockResolvedValueOnce({ messages: [] })
    .mockResolvedValue({ messages: [message] });
  render(
    <MemoryRouter>
      <ChatThread conversation={conversation} userId={2}
        onAccessLost={vi.fn()} onConversationUpdate={vi.fn()} />
    </MemoryRouter>,
  );
  await act(async () => {});
  expect(screen.queryByText(message.body)).toBeNull();
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(api.chat.messages).toHaveBeenLastCalledWith(2, { after: 0, limit: 100 });
  expect(screen.getByText(message.body)).toBeTruthy();
});

test("an empty conversation does not start polling before initial loading succeeds", async () => {
  vi.useFakeTimers();
  vi.spyOn(api.chat, "messages").mockRejectedValue(new Error("Offline"));
  render(
    <MemoryRouter>
      <ChatThread conversation={conversation} userId={2}
        onAccessLost={vi.fn()} onConversationUpdate={vi.fn()} />
    </MemoryRouter>,
  );
  await act(async () => {});
  await act(async () => vi.advanceTimersByTimeAsync(6000));
  expect(api.chat.messages).toHaveBeenCalledTimes(1);
  expect(screen.getByText("Offline")).toBeTruthy();
});

test("outgoing groups show sent, delivered and read receipts from the server", async () => {
  vi.spyOn(api.chat, "readMessages").mockResolvedValue(undefined);
  const outgoing = [1, 2, 3].map((id) => ({
    ...message, id, sender_id: user.id, recipient_id: 2,
    body: `Outgoing ${id}`, created_at: `2026-11-22T12:${id * 10}:00Z`,
  }));
  vi.spyOn(api.chat, "messages").mockResolvedValue({
    messages: outgoing, receipts: { delivered_through: 2, read_through: 1 },
  });
  render(<MemoryRouter><ChatThread conversation={conversation} userId={2}
    onAccessLost={vi.fn()} onConversationUpdate={vi.fn()} /></MemoryRouter>);
  expect(await screen.findByRole("img", { name: "Read" })).toBeTruthy();
  expect(screen.getByRole("img", { name: "Delivered" })).toBeTruthy();
  expect(screen.getByRole("img", { name: "Sent" })).toBeTruthy();
});


test.each([false, true])("date-message buttons open, close and reopen the planner (notification link: %s)", async (fromNotification) => {
  const plan: DatePlan = {
    id: 5, creator_id: user.id, partner_id: 2, proposed_by: user.id,
    title: "Coffee and a walk", starts_at: "2050-06-15T16:30:00Z", timezone: "Europe/Paris",
    venue: "Central café", notes: "By the entrance", state: "proposed", version: 1,
    updated_by: user.id, cancellation_reason: null,
    created_at: message.created_at, updated_at: message.created_at,
  };
  vi.spyOn(planApi, "list").mockResolvedValue({ plans: [plan], has_more: false });
  vi.spyOn(api.chat, "readMessages").mockResolvedValue(undefined);
  vi.spyOn(api.chat, "messages").mockResolvedValue({ messages: [{
    ...message, sender_id: user.id, recipient_id: 2, plan_id: plan.id,
    plan_action: "propose", plan_snapshot: plan,
  }] });
  function Location() {
    const location = useLocation();
    return <output>{location.pathname}{location.search}</output>;
  }
  render(<MemoryRouter initialEntries={[`/chat/2?keep=yes${fromNotification ? "&plans=1" : ""}`]}><Location /><ChatThread conversation={conversation} userId={2}
    onAccessLost={vi.fn()} onConversationUpdate={vi.fn()} /></MemoryRouter>);
  if (fromNotification) {
    expect(await screen.findByRole("dialog", { name: "Plans with Bob Example" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
  }
  fireEvent.click(await screen.findByRole("button", { name: "View details" }));
  expect(await screen.findByRole("dialog", { name: "Plans with Bob Example" })).toBeTruthy();
  expect(screen.getByText("/chat/2?keep=yes&plans=1")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText("/chat/2?keep=yes")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "View details" }));
  expect(screen.getByRole("dialog", { name: "Plans with Bob Example" })).toBeTruthy();
});


test.each(["accept", "reschedule", "cancel"] as const)("inline proposal %s uses the correct current version and workflow", async (action) => {
  const proposer = action === "cancel" ? user.id : 2;
  const plan: DatePlan = {
    id: 5, creator_id: user.id, partner_id: 2, proposed_by: proposer,
    title: "Coffee and a walk", starts_at: "2050-06-15T16:30:00Z", timezone: "Europe/Paris",
    venue: "Central café", notes: "By the entrance", state: "proposed", version: 1,
    updated_by: proposer, cancellation_reason: null,
    created_at: message.created_at, updated_at: message.created_at,
  };
  const invitation = { ...message, sender_id: proposer, recipient_id: proposer === user.id ? 2 : user.id,
    plan_id: plan.id, plan_action: "propose" as const, plan_snapshot: plan };
  const accepted = { ...plan, state: "accepted" as const, version: 2 };
  vi.spyOn(planApi, "list").mockResolvedValue({ plans: [plan], has_more: false });
  const update = vi.spyOn(planApi, "update").mockResolvedValue(accepted);
  vi.spyOn(api.chat, "readMessages").mockResolvedValue(undefined);
  vi.spyOn(api.chat, "messages").mockResolvedValue({ messages: [invitation] });
  render(<MemoryRouter><ChatThread conversation={conversation} userId={2}
    onAccessLost={vi.fn()} onConversationUpdate={vi.fn()} /></MemoryRouter>);
  if (action === "accept") {
    vi.mocked(api.chat.messages).mockResolvedValue({ messages: [invitation, {
      ...invitation, id: 2, sender_id: user.id, recipient_id: 2, plan_action: "accept", plan_snapshot: accepted,
    }] });
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    await act(async () => {});
    expect(update).toHaveBeenCalledWith(plan, "accept");
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
    expect(screen.getByRole("link", { name: "View calendar" })).toBeTruthy();
  } else if (action === "reschedule") {
    fireEvent.click(await screen.findByRole("button", { name: "Suggest another time" }));
    expect(await screen.findByRole("heading", { name: "Suggest new details" })).toBeTruthy();
    expect((screen.getByLabelText("Date and time") as HTMLInputElement).value).toBe("2050-06-15T18:30");
    expect(update).not.toHaveBeenCalled();
  } else {
    fireEvent.click(await screen.findByRole("button", { name: "Cancel invitation" }));
    expect(await screen.findByRole("heading", { name: "Cancel “Coffee and a walk”?" })).toBeTruthy();
    expect(update).not.toHaveBeenCalled();
  }
});
