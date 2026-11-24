import type { Notification, NotificationKind } from "../api";

export const NOTIFICATION_COPY: Record<
  NotificationKind,
  { menu: string; page: string; icon: "heart" | "star" | "eye" | "message" | "heartOff" | "calendar" }
> = {
  plan: { menu: "sent you a date plan invitation or update", page: "sent you a date plan invitation or update", icon: "calendar" },
  like: { menu: "liked you", page: "liked your profile", icon: "heart" },
  match: { menu: "is now connected with you", page: "is now connected with you", icon: "star" },
  visit: { menu: "viewed your profile", page: "visited your profile", icon: "eye" },
  message: { menu: "sent you a message", page: "sent you a message", icon: "message" },
  unlike: { menu: "ended your connection", page: "ended your connection", icon: "heartOff" },
};

export function notificationTarget(item: Notification): string {
  if (item.kind === "plan") return `/chat/${item.actor_id}?plans=1`;
  if (item.kind === "message" || item.kind === "match") return `/chat/${item.actor_id}`;
  return `/profile/${item.actor_id}`;
}


/** Stable identity for an actor/type row when a newer event replaces it. */
export function notificationKey(item: Notification): string {
  return `${item.kind}:${item.actor_id}`;
}

/** Describe the unread message total while keeping read conversation history compact. */
export function notificationCopy(item: Notification, surface: "menu" | "page"): string {
  if (item.kind === "message" && !item.read_at) {
    return item.unread_count === 1 ? "sent you a new message" : `sent you ${item.unread_count} new messages`;
  }
  if (item.kind === "visit" && !item.read_at && item.unread_count > 1) {
    return `${surface === "menu" ? "viewed" : "visited"} your profile ${item.unread_count} times`;
  }
  return NOTIFICATION_COPY[item.kind][surface];
}
