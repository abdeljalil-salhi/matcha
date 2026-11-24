import { PlanCardLayout } from "./PlanCardLayout";
import type { DatePlan, PlanAction } from "../../api/types/plans";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

export const PLAN_LABELS = {
  proposed: "Awaiting response", accepted: "Confirmed", declined: "Declined", cancelled: "Cancelled",
};

export function PlanCard({ plan, viewerId, busy, onAction, onReschedule }: {
  plan: DatePlan;
  viewerId: number;
  busy: boolean;
  onAction: (plan: DatePlan, action: PlanAction) => void;
  onReschedule: (plan: DatePlan) => void;
}) {
  const past = new Date(plan.starts_at).getTime() <= Date.now();
  const active = !past && (plan.state === "proposed" || plan.state === "accepted");
  const invited = plan.proposed_by !== viewerId;
  return <PlanCardLayout plan={plan} showContext actions={active ? <>
    {plan.state === "proposed" && invited ? <>
      <Button size="sm" disabled={busy} onClick={() => onAction(plan, "accept")} icon={<Icon name="check" size={16} />}>Accept</Button>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAction(plan, "decline")}>Decline</Button>
    </> : null}
    <Button size="sm" variant="secondary" disabled={busy} onClick={() => onReschedule(plan)}>Reschedule</Button>
    <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction(plan, "cancel")}>Cancel plan</Button>
  </> : null}>
    {past ? <p className="plan-message__history">Past arrangement</p> : null}
    {active && plan.state === "proposed" ? <p className="plan-message__history">{invited ? "You’re invited. Confirm the details before accepting." : "Your invitation is waiting for a response."}</p> : null}
  </PlanCardLayout>;
}
