import type { Message } from "../../api";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

const ACTION_LABELS = {
  propose: "Date invitation", reschedule: "New date proposal", accept: "Date confirmed",
  decline: "Date declined", cancel: "Date cancelled", connection_ended: "Date cancelled",
};

export function PlanMessage({ message, onOpen }: { message: Message; onOpen: () => void }) {
  const plan = message.plan_snapshot;
  if (!plan) return <p>{message.body}</p>;
  const time = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium", timeStyle: "short", timeZone: plan.timezone,
  }).format(new Date(plan.starts_at));
  return <article className="plan-message">
    <div className="plan-message__label"><Icon name="calendar" size={20} />
      {message.plan_action ? ACTION_LABELS[message.plan_action] : "Date plan"}</div>
    <h3>{plan.title}</h3>
    <p className="plan-message__schedule"><time dateTime={plan.starts_at}>{time} ({plan.timezone})</time></p>
    <p>{plan.venue}</p>
    {plan.notes ? <p className="plan-message__notes">{plan.notes}</p> : null}
    {plan.cancellation_reason ? <p>{plan.cancellation_reason}</p> : null}
    <Button size="sm" variant="secondary" onClick={onOpen}>Open date planner</Button>
  </article>;
}
