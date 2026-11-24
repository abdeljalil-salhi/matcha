import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../api";
import { planApi } from "../../api/plans";
import type { DatePlan, PlanAction, PlanDetails } from "../../api/types/plans";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { uuid } from "../../utils/format";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { PlanCard, PLAN_LABELS } from "./PlanCard";
import { PlanForm } from "./PlanForm";

const PLAN_POLL_MS = 2000;

export function DatePlanner({ userId, name, onAccessLost, open, onOpenChange, onChanged, requestedEdit, onRequestHandled }: {
  userId: number; name: string; onAccessLost: () => void;
  open: boolean; onOpenChange: (open: boolean) => void; onChanged?: () => void;
  requestedEdit?: { plan: DatePlan; action: "reschedule" | "cancel" } | null;
  onRequestHandled?: () => void;
}) {
  const { user } = useAuth();
  const { notify } = useToast();
  const [scope, setScope] = useState<"conversation" | "upcoming">("conversation");
  const [plans, setPlans] = useState<DatePlan[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ plan: DatePlan | null } | null>(null);
  const [cancelling, setCancelling] = useState<DatePlan | null>(null);
  const createRequest = useRef({ id: uuid(), key: "" });
  const fetchingMore = useRef(false);
  const loadedCount = useRef(25);
  const generation = useRef(0);
  const mutationBusy = useRef(false);
  mutationBusy.current = busy;
  const refreshing = useRef(false);

  useEffect(() => {
    if (!open || !requestedEdit) return;
    setScope("conversation");
    setError(null);
    setForm(requestedEdit.action === "reschedule" ? { plan: requestedEdit.plan } : null);
    setCancelling(requestedEdit.action === "cancel" ? requestedEdit.plan : null);
    onRequestHandled?.();
  }, [open, requestedEdit, onRequestHandled]);

  const fetchPage = useCallback((offset = 0, signal?: AbortSignal) =>
    scope === "conversation" ? planApi.list(userId, offset, signal) : planApi.upcoming(offset, signal), [scope, userId]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const request = ++generation.current;
    refreshing.current = true;
    setLoading(true);
    try {
      const found: DatePlan[] = [];
      let result;
      do {
        result = await fetchPage(found.length, signal);
        if (signal?.aborted || request !== generation.current) return;
        found.push(...result.plans);
      } while (result.has_more && result.plans.length && found.length < loadedCount.current);
      setPlans(found);
      setHasMore(result.has_more);
      setLoadError(null);
    } catch (cause) {
      if (signal?.aborted || request !== generation.current) return;
      setLoadError(cause instanceof Error ? cause.message : "Unable to load plans.");
    } finally {
      if (request === generation.current) {
        refreshing.current = false;
        if (!signal?.aborted) setLoading(false);
      }
    }
  }, [fetchPage]);

  useEffect(() => {
    loadedCount.current = 25;
    setPlans([]);
    setHasMore(false);
    const controller = new AbortController();
    void refresh(controller.signal);
    const update = () => {
      if (document.visibilityState === "visible" && navigator.onLine
        && !fetchingMore.current && !mutationBusy.current && !refreshing.current) {
        void refresh(controller.signal);
      }
    };
    const interval = window.setInterval(update, PLAN_POLL_MS);
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
  }, [refresh]);

  const editing = form?.plan ?? cancelling;
  const latestEditing = editing ? plans.find((plan) => plan.id === editing.id) : null;
  const stale = Boolean(editing && (!latestEditing || latestEditing.version !== editing.version));

  const close = () => {
    if (busy) return;
    onOpenChange(false);
    setForm(null);
    setCancelling(null);
  };

  const loadMore = async () => {
    if (fetchingMore.current) return;
    fetchingMore.current = true;
    const request = generation.current;
    setLoading(true);
    try {
      const result = await fetchPage(plans.length);
      if (request !== generation.current) return;
      loadedCount.current = plans.length + result.plans.length;
      setPlans((current) => [...new Map([...current, ...result.plans].map((plan) => [plan.id, plan])).values()]);
      setHasMore(result.has_more);
    } catch (cause) {
      if (request === generation.current) setLoadError(cause instanceof Error ? cause.message : "Unable to load more plans.");
    } finally { fetchingMore.current = false; if (request === generation.current) setLoading(false); }
  };

  const handleFailure = (cause: unknown) => {
    setError(cause instanceof Error ? cause.message : "Unable to update this plan.");
    if (cause instanceof ApiError && cause.status === 403) onAccessLost();
    if (cause instanceof ApiError && cause.status === 409) {
      setForm(null);
      setCancelling(null);
      void refresh();
      notify("This plan changed. Review the latest details before responding.", "info");
    }
  };

  const act = async (plan: DatePlan, action: PlanAction) => {
    if (stale) return;
    if (action === "cancel" && cancelling?.id !== plan.id) {
      setCancelling(plan);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await planApi.update(plan, action);
      onChanged?.();
      setCancelling(null);
      await refresh();
      notify(action === "accept" ? "Your date is confirmed." : action === "decline" ? "Invitation declined." : "Plan cancelled.", "success");
    } catch (cause) { handleFailure(cause); }
    finally { setBusy(false); }
  };

  const submit = async (details: PlanDetails) => {
    if (!form || busy || stale) return;
    setBusy(true);
    setError(null);
    try {
      if (form.plan) await planApi.update(form.plan, "reschedule", details);
      else {
        const key = JSON.stringify(details);
        if (createRequest.current.key && createRequest.current.key !== key) createRequest.current.id = uuid();
        createRequest.current.key = key;
        await planApi.create(userId, details, createRequest.current.id);
      }
      onChanged?.();
      setForm(null);
      await refresh();
      notify("Proposal sent. The other person can now respond.", "success");
    } catch (cause) { handleFailure(cause); }
    finally { setBusy(false); }
  };

  const propose = () => {
    createRequest.current = { id: uuid(), key: "" };
    setScope("conversation");
    setForm({ plan: null });
    setCancelling(null);
    setError(null);
  };
  const next = plans.find((plan) => (plan.creator_id === userId || plan.partner_id === userId)
    && new Date(plan.starts_at).getTime() > Date.now() && ["proposed", "accepted"].includes(plan.state));

  return <>
    <div className="date-planner-bar">
      <button type="button" className="date-planner-bar__open" onClick={() => onOpenChange(true)}>
        <Icon name="calendar" size={19} />
        <span>{next ? `${next.title} · ${PLAN_LABELS[next.state]}` : "Plan a date together"}</span>
        <Icon name="chevronRight" size={15} />
      </button>
    </div>
    <Modal open={open} onClose={close} title={scope === "upcoming" ? "Upcoming plans" : `Plans with ${name}`} size="lg" className="date-planner-modal">
      <div className="date-planner">
        {error || loadError ? <div className="error-banner" role="alert">{error ?? loadError}<Button size="sm" variant="ghost" onClick={() => { setError(null); void refresh(); }}>Refresh</Button></div> : null}
        {stale ? <div className="notice notice--info" role="alert">
          This plan was updated{latestEditing ? ` · ${PLAN_LABELS[latestEditing.state]}` : " or is no longer active"}. Review the latest details before responding.
          <Button size="sm" variant="secondary" onClick={() => { setForm(null); setCancelling(null); setError(null); }}>Review latest plan</Button>
        </div> : null}
        {cancelling ? <section className="date-plan-cancel">
          <h3>Cancel “{cancelling.title}”?</h3>
          <p>The other person will be notified.</p>
          <div><Button variant="secondary" disabled={busy} onClick={() => setCancelling(null)}>Keep plan</Button><Button variant="danger" loading={busy} disabled={stale} onClick={() => void act(cancelling, "cancel")}>Cancel plan</Button></div>
        </section> : form ? <PlanForm key={form.plan ? `${form.plan.id}-${form.plan.version}` : createRequest.current.id}
          plan={form.plan} busy={busy} stale={stale} onSubmit={(details) => void submit(details)} onCancel={() => setForm(null)} /> : <>
          <div className="date-planner__toolbar">
            <div role="group" aria-label="Plan list">
              <button type="button" aria-pressed={scope === "conversation"} onClick={() => setScope("conversation")}>This conversation</button>
              <button type="button" aria-pressed={scope === "upcoming"} onClick={() => setScope("upcoming")}>Upcoming plans</button>
            </div>
            <Button size="sm" onClick={propose} icon={<Icon name="plus" size={16} />}>Propose a date</Button>
          </div>
          {loading && !plans.length ? <p role="status">Loading plans…</p> : null}
          {!loading && !error && !loadError && !plans.length ? <p className="date-planner__empty">{scope === "conversation" ? "Choose a time and place to meet. Your invitation will appear here." : "Your upcoming invitations and confirmed dates will appear here."}</p> : null}
          {plans.map((plan) => <PlanCard key={plan.id} plan={plan} viewerId={user?.id ?? 0} busy={busy}
            onAction={(entry, action) => void act(entry, action)} onReschedule={(entry) => { setError(null); setForm({ plan: entry }); }} />)}
          {hasMore ? <Button variant="secondary" loading={loading} onClick={() => void loadMore()}>Load more plans</Button> : null}
        </>}
      </div>
    </Modal>
  </>;
}
