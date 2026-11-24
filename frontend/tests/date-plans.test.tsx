import { PlanForm } from "../src/components/plans/PlanForm";
import { PLAN_ACTIVITIES } from "../src/data/planActivities";
import { PlanMessage } from "../src/components/plans/PlanMessage";
import { message } from "./fixtures";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import { ApiError } from "../src/api";
import { planApi } from "../src/api/plans";
import type { DatePlan } from "../src/api/types/plans";
import { DatePlanner } from "../src/components/plans/DatePlanner";
import { PlanCard } from "../src/components/plans/PlanCard";
import { notificationTarget } from "../src/data/notifications";

vi.mock("../src/context/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock("../src/context/ToastContext", () => ({ useToast: () => ({ notify: vi.fn() }) }));

afterEach(() => vi.useRealTimers());

const plan: DatePlan = {
  id: 5, creator_id: 2, partner_id: 1, proposed_by: 2, title: "Coffee together",
  starts_at: "2050-06-15T16:30:00Z", timezone: "Europe/Paris", venue: "Central café", notes: "By the entrance",
  state: "proposed", version: 1, updated_by: 2, cancellation_reason: null,
  created_at: "2026-11-24T00:00:00Z", updated_at: "2026-11-24T00:00:00Z",
};

function Harness() {
  const [open, setOpen] = useState(true);
  return <DatePlanner userId={2} name="Lina" onAccessLost={vi.fn()} open={open} onOpenChange={setOpen} />;
}

function setup(entries: DatePlan[] = []) {
  vi.spyOn(planApi, "list").mockResolvedValue({ plans: entries, has_more: false });
  vi.spyOn(planApi, "upcoming").mockResolvedValue({ plans: entries, has_more: false });
  render(<MemoryRouter><Harness /></MemoryRouter>);
}

test("invitees can accept and the updated confirmed state replaces response actions", async () => {
  const update = vi.spyOn(planApi, "update").mockResolvedValue({ ...plan, state: "accepted", version: 2 });
  setup([plan]);
  await screen.findByText("Coffee together", { selector: "h3" });
  vi.mocked(planApi.list).mockResolvedValue({ plans: [{ ...plan, state: "accepted", version: 2 }], has_more: false });
  fireEvent.click(screen.getByRole("button", { name: "Accept" }));
  await screen.findByText("Confirmed");
  expect(update).toHaveBeenCalledWith(plan, "accept");
  expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
});

test("a proposer cannot accept their own invitation", () => {
  render(<PlanCard plan={{ ...plan, proposed_by: 1 }} viewerId={1} busy={false} onAction={vi.fn()} onReschedule={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  expect(screen.getByText("Your invitation is waiting for a response.")).toBeTruthy();
});

test("cancelling asks for confirmation before calling the API", async () => {
  const update = vi.spyOn(planApi, "update").mockResolvedValue({ ...plan, state: "cancelled", version: 2 });
  setup([plan]);
  fireEvent.click(await screen.findByRole("button", { name: "Cancel plan" }));
  expect(update).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Keep plan" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Cancel plan" }));
  await waitFor(() => expect(update).toHaveBeenCalledWith(plan, "cancel"));
});

test("retrying a failed invitation keeps its idempotency key", async () => {
  const create = vi.spyOn(planApi, "create").mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue({ ...plan, proposed_by: 1 });
  setup();
  fireEvent.click(await screen.findByRole("button", { name: "Propose a date" }));
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Coffee" } });
  fireEvent.change(screen.getByLabelText("Date and time"), { target: { value: "2050-06-15T18:30" } });
  fireEvent.change(screen.getByLabelText("Meeting place"), { target: { value: "Central café" } });
  fireEvent.change(screen.getByLabelText("Timezone"), { target: { value: "Europe/Paris" } });
  fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
  await screen.findByText("Offline");
  fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
  expect(create.mock.calls[0]?.[2]).toBe(create.mock.calls[1]?.[2]);
  expect(create.mock.calls[0]?.[1]).toMatchObject({ local_time: "2050-06-15T18:30", timezone: "Europe/Paris" });
});

test("rescheduling uses the plan's local time and stale versions refresh the plan", async () => {
  const update = vi.spyOn(planApi, "update").mockRejectedValue(new ApiError(409, "Changed"));
  setup([plan]);
  fireEvent.click(await screen.findByRole("button", { name: "Reschedule" }));
  expect((screen.getByLabelText("Date and time") as HTMLInputElement).value).toBe("2050-06-15T18:30");
  fireEvent.click(screen.getByRole("button", { name: "Send new proposal" }));
  await waitFor(() => expect(update).toHaveBeenCalledWith(plan, "reschedule", expect.objectContaining({ timezone: "Europe/Paris" })));
  await screen.findByRole("button", { name: "Propose a date" });
  expect(planApi.list).toHaveBeenCalledTimes(2);
});

test("upcoming plans use the cross-conversation endpoint and notification links open the planner", async () => {
  setup();
  fireEvent.click(await screen.findByRole("button", { name: "Upcoming plans" }));
  await waitFor(() => expect(planApi.upcoming).toHaveBeenCalled());
  expect(notificationTarget({ kind: "plan", actor_id: 2 } as Parameters<typeof notificationTarget>[0])).toBe("/chat/2?plans=1");
});


test("remote date responses appear on the chat polling cycle without reopening", async () => {
  vi.useFakeTimers();
  setup([plan]);
  await act(async () => {});
  expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy();
  vi.mocked(planApi.list).mockResolvedValue({ plans: [{ ...plan, state: "accepted", version: 2 }], has_more: false });
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(screen.getByText("Confirmed")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
});

test("remote changes during rescheduling preserve the draft and prevent stale submission", async () => {
  vi.useFakeTimers();
  setup([plan]);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Reschedule" }));
  fireEvent.change(screen.getByLabelText("Meeting place"), { target: { value: "My unfinished draft" } });
  vi.mocked(planApi.list).mockResolvedValue({ plans: [{ ...plan, title: "Changed by partner", state: "accepted", version: 2 }], has_more: false });
  await act(async () => vi.advanceTimersByTimeAsync(2000));
  expect(screen.getByRole("alert").textContent).toContain("This plan was updated");
  expect((screen.getByLabelText("Meeting place") as HTMLInputElement).value).toBe("My unfinished draft");
  expect((screen.getByRole("button", { name: "Send new proposal" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Review latest plan" }));
  expect(screen.getByRole("heading", { name: "Changed by partner" })).toBeTruthy();
});

test("plan polling resumes immediately when the page becomes visible or reconnects", async () => {
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  setup([plan]);
  await act(async () => {});
  await act(async () => vi.advanceTimersByTimeAsync(4000));
  expect(planApi.list).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue("visible");
  await act(async () => { fireEvent(document, new Event("visibilitychange")); });
  expect(planApi.list).toHaveBeenCalledTimes(2);
  await act(async () => { fireEvent(window, new Event("online")); });
  expect(planApi.list).toHaveBeenCalledTimes(3);
});


test.each([['propose', 'Date invitation'], ['reschedule', 'New date proposal'],
  ['accept', 'Date confirmed'], ['decline', 'Date declined'], ['cancel', 'Date cancelled']] as const)(
  "%s messages show their proposal snapshot and open the planner", (action, label) => {
    const onOpen = vi.fn();
    render(<PlanMessage message={{ ...message, plan_id: plan.id, plan_action: action, plan_snapshot: plan }} onOpen={onOpen} />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByRole("heading", { name: plan.title })).toBeTruthy();
    expect(screen.getByText(plan.venue)).toBeTruthy();
    expect(screen.getByText(plan.notes)).toBeTruthy();
    expect(screen.getByText(/Europe\/Paris/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open date planner" }));
    expect(onOpen).toHaveBeenCalledOnce();
  },
);


function messageCard(entry: DatePlan, latest = entry, viewerId = 1) {
  const respond = vi.fn();
  const reschedule = vi.fn();
  const cancel = vi.fn();
  render(<MemoryRouter><PlanMessage message={{ ...message, plan_id: entry.id, plan_action: "propose", plan_snapshot: entry }}
    latestPlan={latest} viewerId={viewerId} onOpen={vi.fn()} onRespond={respond} onReschedule={reschedule} onCancel={cancel} /></MemoryRouter>);
  return { respond, reschedule, cancel };
}

test("only the current proposal's recipient can accept or decline directly from chat", () => {
  const { respond, reschedule } = messageCard(plan);
  fireEvent.click(screen.getByRole("button", { name: "Accept" }));
  expect(respond).toHaveBeenCalledWith(plan, "accept");
  fireEvent.click(screen.getByRole("button", { name: "Decline" }));
  expect(respond).toHaveBeenCalledWith(plan, "decline");
  fireEvent.click(screen.getByRole("button", { name: "Suggest another time" }));
  expect(reschedule).toHaveBeenCalledWith(plan);
  expect(screen.queryByRole("button", { name: "Cancel invitation" })).toBeNull();
});

test("the proposer sees cancellation and rescheduling instead of accepting their own invitation", () => {
  const { cancel } = messageCard(plan, plan, 2);
  expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Decline" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Cancel invitation" }));
  expect(cancel).toHaveBeenCalledWith(plan);
});

test("superseded proposal messages retain their details without response controls", () => {
  messageCard(plan, { ...plan, version: 2, state: "accepted" });
  expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Suggest another time" })).toBeNull();
  expect(screen.getByText(/Previous update/)).toBeTruthy();
  expect(screen.getByText(plan.venue)).toBeTruthy();
});

test("confirmed cards link to the calendar and never offer proposal responses", () => {
  messageCard({ ...plan, state: "accepted", version: 2 });
  expect(screen.getByText("Confirmed")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  expect(screen.getByRole("link", { name: "View calendar" }).getAttribute("href")).toBe("/calendar");
});

test("expired proposals have no response controls", () => {
  messageCard({ ...plan, starts_at: "2020-01-01T00:00:00Z" });
  expect(screen.queryByRole("button", { name: "Accept" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Suggest another time" })).toBeNull();
});


test.each(PLAN_ACTIVITIES)("$label proposals use their activity artwork", ({ value, image }) => {
  messageCard({ ...plan, activity: value });
  const artwork = document.querySelector<HTMLImageElement>(".plan-message__art");
  expect(artwork?.getAttribute("src")).toBe(image);
});

test("legacy proposals use the generic Other artwork", () => {
  messageCard(plan);
  expect(document.querySelector<HTMLImageElement>(".plan-message__art")?.getAttribute("src")).toBe("/images/date-activity-other.jpg");
});

test("activity selection is sent to the API and retained when editing", async () => {
  vi.spyOn(planApi, "update").mockResolvedValue({ ...plan, activity: "outdoors", version: 2 });
  setup([{ ...plan, activity: "dining" }]);
  fireEvent.click(await screen.findByRole("button", { name: "Reschedule" }));
  expect((screen.getByLabelText("Activity type") as HTMLSelectElement).value).toBe("dining");
  fireEvent.change(screen.getByLabelText("Activity type"), { target: { value: "outdoors" } });
  fireEvent.click(screen.getByRole("button", { name: "Send new proposal" }));
  await waitFor(() => expect(planApi.update).toHaveBeenCalledWith(expect.anything(), "reschedule", expect.objectContaining({ activity: "outdoors" })));
});


test("invitation preview updates every detail locally while composing", () => {
  const submit = vi.fn();
  render(<PlanForm plan={null} busy={false} onSubmit={submit} onCancel={vi.fn()} />);
  const preview = screen.getByRole("region", { name: "Invitation preview" });
  const card = within(preview);
  expect(card.getByRole("heading", { name: "Your invitation title" })).toBeTruthy();
  expect(card.getByText("Choose a date and time")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "A gallery afternoon" } });
  fireEvent.change(screen.getByLabelText("Meeting place"), { target: { value: "The city gallery" } });
  fireEvent.change(screen.getByLabelText(/Notes/), { target: { value: "Meet at the main entrance" } });
  fireEvent.change(screen.getByLabelText("Activity type"), { target: { value: "culture" } });
  fireEvent.change(screen.getByLabelText("Date and time"), { target: { value: "2050-06-15T18:30" } });
  fireEvent.change(screen.getByLabelText("Timezone"), { target: { value: "Pacific/Auckland" } });
  expect(card.getByRole("heading", { name: "A gallery afternoon" })).toBeTruthy();
  expect(card.getByText("The city gallery")).toBeTruthy();
  expect(card.getByText("Meet at the main entrance")).toBeTruthy();
  expect(preview.querySelector("img")?.getAttribute("src")).toBe("/images/date-activity-culture.jpg");
  expect(card.getByText(/6:30 PM.*Pacific\/Auckland/)).toBeTruthy();
  expect(submit).not.toHaveBeenCalled();
  expect(screen.queryByText("This background will appear on your invitation.")).toBeNull();
});

test("rescheduling previews a new proposal and tolerates unfinished timezone input", () => {
  render(<PlanForm plan={{ ...plan, state: "accepted" }} busy={false} onSubmit={vi.fn()} onCancel={vi.fn()} />);
  const card = within(screen.getByRole("region", { name: "Invitation preview" }));
  expect(card.getByText("New date proposal")).toBeTruthy();
  expect(card.getByText("Pending")).toBeTruthy();
  expect(card.queryByText("Confirmed")).toBeNull();
  fireEvent.change(screen.getByLabelText("Timezone"), { target: { value: "Europe/" } });
  expect(card.getByText("Choose a valid timezone")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Timezone"), { target: { value: "Europe/Paris" } });
  expect(card.getByText(/Europe\/Paris/)).toBeTruthy();
});
