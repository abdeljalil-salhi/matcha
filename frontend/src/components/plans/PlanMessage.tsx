import { PlanCardLayout } from "./PlanCardLayout";
import { Link } from "react-router-dom";
import type { Message } from "../../api";
import type { DatePlan } from "../../api/types/plans";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

const ACTION_LABELS = {
  propose: "Date invitation", reschedule: "New date proposal", accept: "Date confirmed",
  decline: "Date declined", cancel: "Date cancelled", connection_ended: "Date cancelled",
};

export function PlanMessage({ message, latestPlan, viewerId = 0, busy = false, onOpen, onRespond, onReschedule, onCancel }: {
  message: Message;
  latestPlan?: DatePlan;
  viewerId?: number;
  busy?: boolean;
  onOpen: () => void;
  onRespond?: (plan: DatePlan, action: "accept" | "decline") => void;
  onReschedule?: (plan: DatePlan) => void;
  onCancel?: (plan: DatePlan) => void;
}) {
  const plan = message.plan_snapshot;
  if (!plan) return <p>{message.body}</p>;
  const current = latestPlan?.version === plan.version;
  const active = current && new Date(plan.starts_at).getTime() > Date.now()
    && [plan.creator_id, plan.partner_id].includes(viewerId)
    && (plan.state === "proposed" || plan.state === "accepted");
  const invited = plan.proposed_by !== viewerId;
  const confirmed = plan.state === "accepted";
  const pending = plan.state === "proposed";
  return <PlanCardLayout plan={plan} label={message.plan_action ? ACTION_LABELS[message.plan_action] : "Date plan"} actions={<>
      {active && pending && invited && onRespond ? <Button size="sm" disabled={busy}
        icon={<Icon name="check" size={16} />} onClick={() => onRespond(plan, "accept")}>Accept</Button> : null}
      {active && pending && onReschedule ? <Button size="sm" variant="secondary" disabled={busy}
        icon={<Icon name="calendar" size={16} />} onClick={() => onReschedule(plan)}>Suggest another time</Button> : null}
      {active && pending && invited && onRespond ? <Button size="sm" variant="ghost" disabled={busy}
        onClick={() => onRespond(plan, "decline")}>Decline</Button> : null}
      {active && pending && !invited && onCancel ? <Button size="sm" variant="ghost" disabled={busy}
        onClick={() => onCancel(plan)}>Cancel invitation</Button> : null}
      <Button size="sm" variant="secondary" onClick={onOpen}
        icon={confirmed ? <Icon name="calendar" size={16} /> : undefined}>
        {active && pending ? "View details" : "Open date planner"}</Button>
      {confirmed && current ? <Link className="btn btn--secondary btn--sm" to="/calendar"><Icon name="calendar" size={16} /><span>View calendar</span></Link> : null}
    </>}>
    {latestPlan && !current ? <p className="plan-message__history">Previous update · open the planner for the latest details.</p> : null}
  </PlanCardLayout>;
}
