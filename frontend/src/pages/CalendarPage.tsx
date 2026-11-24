import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { planApi } from "../api/plans";
import type { DatePlan } from "../api/types/plans";
import { PLAN_LABELS } from "../components/plans/PlanCard";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { EmptyState, ErrorBanner, Spinner } from "../components/ui/Misc";

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function CalendarPage() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState<string | null>(null);
  const [plans, setPlans] = useState<DatePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    const refresh = async () => {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      try {
        const found: DatePlan[] = [];
        let page;
        do {
          page = await planApi.upcoming(found.length, controller.signal);
          if (controller.signal.aborted) return;
          found.push(...page.plans);
        } while (page.has_more && page.plans.length);
        setPlans([...new Map(found.map((plan) => [plan.id, plan])).values()]);
        setError(null);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load your calendar.");
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void refresh();
    const update = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void refresh();
    };
    const interval = window.setInterval(update, 2000);
    window.addEventListener("focus", update);
    window.addEventListener("online", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", update);
      window.removeEventListener("online", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [retry]);

  const upcoming = plans.filter((plan) => new Date(plan.starts_at).getTime() > Date.now()
    && (plan.state === "accepted" || plan.state === "proposed"))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.id - b.id);
  const inMonth = upcoming.filter((plan) => {
    const date = new Date(plan.starts_at);
    return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth();
  });
  const visible = selected ? inMonth.filter((plan) => dayKey(new Date(plan.starts_at)) === selected) : inMonth;
  const counts = new Map<string, number>();
  for (const plan of upcoming) {
    const key = dayKey(new Date(plan.starts_at));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const start = new Date(month);
  start.setDate(1 - (month.getDay() + 6) % 7);
  const days = Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const shiftMonth = (offset: number) => {
    setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1));
    setSelected(null);
  };

  return <div className="calendar-page container">
    <header className="page-heading page-heading--compact">
      <p className="eyebrow">Calendar</p>
      <h1>Something to look forward to.</h1>
      <p className="lead">Your upcoming invitations and confirmed plans, all in one place.</p>
    </header>
    {error ? <ErrorBanner message={error} onRetry={() => setRetry((value) => value + 1)} /> : null}
    <div className="plans-calendar-layout">
      <section className="plans-calendar" aria-label="Plans calendar">
        <header className="plans-calendar__header">
          <h2 aria-live="polite">{monthLabel}</h2>
          <div>
            <Button variant="secondary" size="sm" onClick={() => {
              setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setSelected(null);
            }}>Today</Button>
            <button type="button" className="icon-button" aria-label="Previous month" onClick={() => shiftMonth(-1)}><Icon name="chevronLeft" size={18} /></button>
            <button type="button" className="icon-button" aria-label="Next month" onClick={() => shiftMonth(1)}><Icon name="chevronRight" size={18} /></button>
          </div>
        </header>
        <div className="plans-calendar__weekdays" aria-hidden="true">{days.slice(0, 7).map((day) => <span key={day.getDay()}>{day.toLocaleDateString(undefined, { weekday: "short" })}</span>)}</div>
        <div className="plans-calendar__days">
          {days.map((day) => {
            const key = dayKey(day);
            const count = counts.get(key) ?? 0;
            return <button key={key} type="button"
              className={`plans-calendar__day${day.getMonth() !== month.getMonth() ? " plans-calendar__day--outside" : ""}`}
              aria-label={`${day.toLocaleDateString(undefined, { dateStyle: "full" })}, ${count} ${count === 1 ? "plan" : "plans"}`}
              aria-pressed={selected === key} aria-current={key === dayKey(new Date()) ? "date" : undefined}
              onClick={() => { setSelected(key); setMonth(new Date(day.getFullYear(), day.getMonth(), 1)); }}>
              <span>{day.getDate()}</span>
              {count ? <span className="plans-calendar__count">{count}<span className="plans-calendar__count-label"> {count === 1 ? "plan" : "plans"}</span></span> : null}
            </button>;
          })}
        </div>
        <p className="plans-calendar__timezone">Dates and times shown in {timezone}.</p>
      </section>
      <section className="calendar-agenda" aria-label="Upcoming plans">
        <header><h2>{selected ? "Plans for this day" : "Upcoming this month"}</h2>
          {selected ? <button type="button" className="link-button" onClick={() => setSelected(null)}>Show month</button> : null}</header>
        {loading ? <Spinner label="Loading calendar" /> : null}
        {!loading && !error && !visible.length ? <EmptyState icon={<Icon name="calendar" size={28} />}
          title={selected ? "A little room in your day." : "Your calendar has room."}
          description={selected ? "No upcoming plans on this day. Select another date to see your plans." : "No upcoming plans this month. Make a plan from one of your conversations."}
          action={<Link to="/chat" className="btn btn--secondary btn--sm">Go to conversations</Link>} /> : null}
        {visible.map((plan) => <article key={plan.id} className="calendar-plan">
          <span className={`date-plan-status date-plan-status--${plan.state}`}>{PLAN_LABELS[plan.state]}</span>
          <h3>{plan.title}</h3>
          <p className="calendar-plan__partner">With {plan.partner_first_name} {plan.partner_last_name}</p>
          <p><Icon name="calendar" size={17} /><time dateTime={plan.starts_at}>{new Date(plan.starts_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time></p>
          <p><Icon name="pin" size={17} /><span>{plan.venue}</span></p>
          <Link className="link-button" to={`/chat/${plan.other_id}?plans=1`}>Open date planner <Icon name="arrowRight" size={16} /></Link>
        </article>)}
      </section>
    </div>
  </div>;
}
