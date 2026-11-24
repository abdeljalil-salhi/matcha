import { request } from "./client";
import type { DatePlan, PlanAction, PlanDetails, PlanPage } from "./types/plans";

export const planApi = {
  list: (userId: number, offset = 0, signal?: AbortSignal) =>
    request<PlanPage>(`/chat/${userId}/plans`, { query: { limit: 25, offset }, signal }),
  upcoming: (offset = 0, signal?: AbortSignal) =>
    request<PlanPage>("/me/plans", { query: { limit: 25, offset }, signal }),
  create: (userId: number, details: PlanDetails, clientId: string) =>
    request<DatePlan>(`/chat/${userId}/plans`, { method: "POST", body: { ...details, client_id: clientId } }),
  update: (plan: DatePlan, action: PlanAction, details?: PlanDetails) =>
    request<DatePlan>(`/plans/${plan.id}`, { method: "PATCH", body: { action, version: plan.version, ...details } }),
};
