export type PlanActivity = "coffee" | "dining" | "outdoors" | "culture" | "other";
export type PlanState = "proposed" | "accepted" | "declined" | "cancelled";
export type PlanAction = "accept" | "decline" | "cancel" | "reschedule";

export interface DatePlan {
  activity?: PlanActivity;
  id: number;
  creator_id: number;
  partner_id: number;
  proposed_by: number;
  title: string;
  starts_at: string;
  timezone: string;
  venue: string;
  notes: string;
  state: PlanState;
  version: number;
  updated_by: number;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  other_id?: number;
  partner_first_name?: string;
  partner_last_name?: string;
}

export interface PlanDetails {
  activity: PlanActivity;
  title: string;
  local_time: string;
  timezone: string;
  venue: string;
  notes: string;
}

export interface PlanPage {
  plans: DatePlan[];
  has_more: boolean;
}
