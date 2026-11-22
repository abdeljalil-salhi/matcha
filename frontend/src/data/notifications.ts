import type { Notification, NotificationKind } from "../api";

export const NOTIFICATION_COPY: Record<
  NotificationKind,
  { menu: string; page: string; icon: "heart" | "star" | "eye" | "message" | "heartOff" }
> = {
  like: { menu: "liked you", page: "liked your profile", icon: "heart" },
  match: { menu: "is now connected with you", page: "is now connected with you", icon: "star" },
  visit: { menu: "viewed your profile", page: "visited your profile", icon: "eye" },
  message: { menu: "sent you a message", page: "sent you a message", icon: "message" },
  unlike: { menu: "ended your connection", page: "ended your connection", icon: "heartOff" },
};

export function notificationTarget(item: Notification): string {
  if (item.kind === "message" || item.kind === "match") return `/chat/${item.actor_id}`;
  return `/profile/${item.actor_id}`;
}
