import type { ReactNode } from "react";
import type { DatePlan } from "../../api/types/plans";
import { planActivity } from "../../data/planActivities";
import { Icon } from "../ui/Icon";

const STATE_LABELS = {
  proposed: "Pending", accepted: "Confirmed", declined: "Declined", cancelled: "Cancelled",
};
const HEADINGS = {
  proposed: "Date invitation", accepted: "Date confirmed", declined: "Date declined", cancelled: "Date cancelled",
};

/** Shared presentation for chat history, current plans, and the calendar agenda. */
export function PlanCardLayout({ plan, label, showContext = false, timezone = plan.timezone, children, actions, schedule }: {
  plan: Pick<DatePlan, "activity" | "state" | "title" | "starts_at" | "timezone" | "venue" | "notes" | "cancellation_reason" | "partner_first_name" | "partner_last_name">;
  label?: string;
  showContext?: boolean;
  timezone?: string;
  children?: ReactNode;
  actions?: ReactNode;
  schedule?: ReactNode;
}) {
  const activity = planActivity(plan.activity);
  const confirmed = plan.state === "accepted";
  const pending = plan.state === "proposed";
  const time = schedule === undefined ? new Intl.DateTimeFormat(undefined, {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: timezone,
  }).format(new Date(plan.starts_at)) : "";
  return <article className={`plan-message plan-message--${plan.state}`} data-activity={activity.value}>
    {pending ? <img className="plan-message__art" src={activity.image} alt="" aria-hidden="true" loading="lazy" /> : null}
    <header className="plan-message__header">
      <div className="plan-message__label"><Icon name="calendar" size={19} />{label ?? HEADINGS[plan.state]}</div>
      <span className={`plan-message__status plan-message__status--${plan.state}`}>
        <Icon name={confirmed ? "check" : pending ? "clock" : "close"} size={14} />{STATE_LABELS[plan.state]}
      </span>
    </header>
    <h3>{plan.title}</h3>
    {showContext ? <p className="plan-message__context">
      {plan.partner_first_name ? <span>With {plan.partner_first_name} {plan.partner_last_name}</span> : null}
      <span>{activity.label}</span>
    </p> : null}
    <div className="plan-message__details">
      <p className="plan-message__schedule"><Icon name="calendar" size={17} />
        {schedule === undefined ? <time dateTime={plan.starts_at}>{time} <span className="plan-message__timezone">({timezone})</span></time> : schedule}</p>
      <p><Icon name="pin" size={17} /><span>{plan.venue}</span></p>
      {plan.notes ? <p className="plan-message__notes"><Icon name="menu" size={17} /><span>{plan.notes}</span></p> : null}
      {plan.cancellation_reason ? <p><Icon name="info" size={17} /><span>{plan.cancellation_reason}</span></p> : null}
    </div>
    {!pending ? <span className="plan-message__seal" aria-hidden="true"><Icon name={confirmed ? "check" : "close"} size={31} strokeWidth={2.5} /></span> : null}
    {children}
    {actions ? <footer className="plan-message__actions">{actions}</footer> : null}
  </article>;
}
