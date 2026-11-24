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
  const time = new Intl.DateTimeFormat(undefined, {
    dateStyle: "full", timeStyle: "short", timeZone: plan.timezone,
  }).format(new Date(plan.starts_at));
  return <article className="date-plan-card">
    <header>
      <h3>{plan.title}</h3>
      <span className={`date-plan-status date-plan-status--${plan.state}`}>{PLAN_LABELS[plan.state]}</span>
    </header>
    {plan.partner_first_name ? <p className="date-plan-card__partner">With {plan.partner_first_name} {plan.partner_last_name}</p> : null}
    <p className="date-plan-card__detail"><Icon name="calendar" size={18} /><time dateTime={plan.starts_at}>{time} ({plan.timezone})</time></p>
    <p className="date-plan-card__detail"><Icon name="pin" size={18} /><span>{plan.venue}</span></p>
    {plan.notes ? <p className="date-plan-card__notes">{plan.notes}</p> : null}
    {plan.cancellation_reason ? <p className="text-small text-muted">{plan.cancellation_reason}</p> : null}
    {past ? <p className="text-small text-muted">Past arrangement</p> : null}
    {active ? <>
      {plan.state === "proposed" ? <p className="text-small text-muted">{invited ? "You’re invited. Confirm the details before accepting." : "Your invitation is waiting for a response."}</p> : null}
      <div className="date-plan-card__actions">
        {plan.state === "proposed" && invited ? <>
          <Button size="sm" disabled={busy} onClick={() => onAction(plan, "accept")} icon={<Icon name="check" size={16} />}>Accept</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAction(plan, "decline")}>Decline</Button>
        </> : null}
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => onReschedule(plan)}>Reschedule</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction(plan, "cancel")}>Cancel plan</Button>
      </div>
    </> : null}
  </article>;
}
