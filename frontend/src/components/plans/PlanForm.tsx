import { PLAN_ACTIVITIES } from "../../data/planActivities";
import { useState, type FormEvent } from "react";
import type { DatePlan, PlanDetails, PlanActivity } from "../../api/types/plans";
import { Button } from "../ui/Button";

function localTime(plan: DatePlan): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: plan.timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(plan.starts_at));
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}

export function PlanForm({ plan, busy, stale = false, onSubmit, onCancel }: {
  plan: DatePlan | null;
  busy: boolean;
  stale?: boolean;
  onSubmit: (details: PlanDetails) => void;
  onCancel: () => void;
}) {
  const [details, setDetails] = useState<PlanDetails>(() => ({
    activity: plan?.activity ?? "other",
    title: plan?.title ?? "", venue: plan?.venue ?? "", notes: plan?.notes ?? "",
    local_time: plan ? localTime(plan) : "",
    timezone: plan?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
  }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!busy && !stale) onSubmit(details);
  };
  return <form className="date-plan-form" onSubmit={submit}>
    <h3>{plan ? "Suggest new details" : "Plan something together"}</h3>
    {plan ? <p className="text-small text-muted">The other person will need to accept these changes.</p> : null}
    <label>Activity type<select className="input" value={details.activity}
      onChange={(event) => setDetails({ ...details, activity: event.target.value as PlanActivity })}>
      {PLAN_ACTIVITIES.map((activity) => <option key={activity.value} value={activity.value}>{activity.label}</option>)}
    </select></label>
    <label>Title<input className="input" required maxLength={100} value={details.title} placeholder="Coffee and a walk"
      onChange={(event) => setDetails({ ...details, title: event.target.value })} /></label>
    <div className="date-plan-form__time">
      <label>Date and time<input className="input" type="datetime-local" required value={details.local_time}
        onChange={(event) => setDetails({ ...details, local_time: event.target.value })} /></label>
      <label>Timezone<input className="input" required maxLength={80} value={details.timezone} placeholder="Europe/Paris"
        onChange={(event) => setDetails({ ...details, timezone: event.target.value })} /></label>
    </div>
    <p className="text-small text-muted">Enter the time in the meeting’s timezone. Clock-change times are checked when you send.</p>
    <label>Meeting place<input className="input" required maxLength={200} value={details.venue} placeholder="Café name or meeting point"
      onChange={(event) => setDetails({ ...details, venue: event.target.value })} /></label>
    <label>Notes <span className="text-muted">(optional)</span><textarea className="input textarea" maxLength={1000} rows={3} value={details.notes}
      onChange={(event) => setDetails({ ...details, notes: event.target.value })} /></label>
    <div className="date-plan-form__actions">
      <Button variant="secondary" disabled={busy} onClick={onCancel}>Back to plans</Button>
      <Button type="submit" loading={busy} disabled={stale}>{plan ? "Send new proposal" : "Send invitation"}</Button>
    </div>
  </form>;
}
