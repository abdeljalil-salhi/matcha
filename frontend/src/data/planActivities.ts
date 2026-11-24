import type { PlanActivity } from "../api/types/plans";

export const PLAN_ACTIVITIES: { value: PlanActivity; label: string; image: string }[] = [
  { value: "coffee", label: "Coffee", image: "/images/date-invitation-cafe.jpg" },
  { value: "dining", label: "Food & dining", image: "/images/date-activity-dining.jpg" },
  { value: "outdoors", label: "Outdoors", image: "/images/date-activity-outdoors.jpg" },
  { value: "culture", label: "Arts & culture", image: "/images/date-activity-culture.jpg" },
  { value: "other", label: "Other", image: "/images/date-activity-other.jpg" },
];

export function planActivity(value?: string) {
  return PLAN_ACTIVITIES.find((activity) => activity.value === value) ?? PLAN_ACTIVITIES[4]!;
}
