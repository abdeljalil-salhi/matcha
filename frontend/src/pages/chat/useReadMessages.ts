import { useCallback, useEffect, useRef } from "react";
import type { Message } from "../../api";
import { useNotifications } from "../../context/NotificationsContext";

const READ_RETRY_MS = 2000;

/** Acknowledge displayed incoming messages only while the conversation is visible. */
export function useReadMessages(userId: number, messages: Message[], enabled: boolean) {
  const { notifications, markOne } = useNotifications();
  const pending = useRef(new Set<number>());
  const attemptedAt = useRef(new Map<number, number>());

  const markDisplayed = useCallback(() => {
    if (!enabled || document.visibilityState !== "visible") return;
    const displayed = new Set(messages.filter((item) => item.sender_id === userId).map((item) => item.id));
    for (const item of notifications) {
      if (item.read_at) {
        attemptedAt.current.delete(item.id);
        continue;
      }
      if (item.kind !== "message" || item.actor_id !== userId ||
          item.message_id === null || !displayed.has(item.message_id) ||
          pending.current.has(item.id)) continue;
      const now = Date.now();
      const previous = attemptedAt.current.get(item.id);
      if (previous !== undefined && now - previous < READ_RETRY_MS) continue;
      pending.current.add(item.id);
      attemptedAt.current.set(item.id, now);
      // A failed acknowledgement stays unread and is retried without a success toast.
      void markOne(item.id).catch(() => undefined).finally(() => pending.current.delete(item.id));
    }
  }, [enabled, messages, notifications, userId, markOne]);

  useEffect(() => {
    markDisplayed();
    const interval = window.setInterval(markDisplayed, READ_RETRY_MS);
    document.addEventListener("visibilitychange", markDisplayed);
    window.addEventListener("focus", markDisplayed);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", markDisplayed);
      window.removeEventListener("focus", markDisplayed);
    };
  }, [markDisplayed]);
}
