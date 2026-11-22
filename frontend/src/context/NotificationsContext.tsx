import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, type Notification, type NotificationPage } from "../api";
import { useAuth } from "./AuthContext";

const POLL_MS = 2000;
const MAX_ITEMS = 500;

interface NotificationsContextValue {
  notifications: Notification[];
  unread: { total: number; messages: number };
  syncing: boolean;
  refresh: () => Promise<void>;
  loadOlder: () => Promise<void>;
  hasMore: boolean;
  markOne: (id: number) => Promise<void>;
  markAllRead: (throughId?: number) => Promise<void>;
  snapshotVisible: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function mergeNewest(current: Notification[], incoming: Notification[]): Notification[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => b.id - a.id).slice(0, MAX_ITEMS);
}

function mergeOlder(current: Notification[], incoming: Notification[]): Notification[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => b.id - a.id).slice(0, MAX_ITEMS);
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const authenticated = Boolean(user);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState({ total: 0, messages: 0 });
  const [syncing, setSyncing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const controllers = useRef<Set<AbortController>>(new Set());
  const snapshotThrough = useRef<number | null>(null);

  const applyPage = useCallback((page: NotificationPage) => {
    setNotifications((current) => mergeNewest(current, page.notifications));
    setUnread(page.unread);
    if (page.notifications.length === 0) setHasMore(false);
  }, []);

  const beginRequest = useCallback((): { id: number; controller: AbortController } | null => {
    if (inFlight.current || !userId) return null;
    const id = generation.current;
    const controller = new AbortController();
    inFlight.current = true;
    controllers.current.add(controller);
    setSyncing(true);
    return { id, controller };
  }, [userId]);

  const endRequest = useCallback((id: number, controller: AbortController) => {
    controllers.current.delete(controller);
    if (generation.current !== id) return;
    inFlight.current = false;
    setSyncing(false);
  }, []);

  const refresh = useCallback(async () => {
    const request = beginRequest();
    if (!request) return;
    try {
      const page = await api.notifications.list({ limit: 25 }, request.controller.signal);
      if (generation.current === request.id) applyPage(page);
    } catch {
      // A 401 dispatches the global unauthorized event; other failures self-heal on the next poll.
    } finally {
      endRequest(request.id, request.controller);
    }
  }, [beginRequest, applyPage, endRequest]);

  useEffect(() => {
    generation.current += 1;
    inFlight.current = false;
    for (const controller of controllers.current) controller.abort();
    controllers.current.clear();

    if (!authenticated) {
      setNotifications([]);
      setUnread({ total: 0, messages: 0 });
      setHasMore(true);
      setSyncing(false);
      snapshotThrough.current = null;
      return;
    }

    const poll = () => {
      void api.notifications.presence().catch(() => undefined);
      void refresh();
    };
    poll();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "hidden" || !navigator.onLine) return;
      poll();
    }, POLL_MS);
    window.addEventListener("focus", poll);
    window.addEventListener("online", poll);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", poll);
      window.removeEventListener("online", poll);
      for (const controller of controllers.current) controller.abort();
      controllers.current.clear();
      generation.current += 1;
    };
  }, [authenticated, userId, refresh]);

  const loadOlder = useCallback(async () => {
    const oldest = notifications.at(-1)?.id;
    if (!oldest || !hasMore) return;
    const request = beginRequest();
    if (!request) return;
    try {
      const page = await api.notifications.list(
        { before: oldest, limit: 25 },
        request.controller.signal,
      );
      if (generation.current !== request.id) return;
      setNotifications((current) => mergeOlder(current, page.notifications));
      setUnread(page.unread);
      if (page.notifications.length < 25) setHasMore(false);
    } catch {
      // Keep the existing page on failure.
    } finally {
      endRequest(request.id, request.controller);
    }
  }, [notifications, hasMore, beginRequest, endRequest]);

  const markOne = useCallback(
    async (id: number) => {
      const item = notifications.find((entry) => entry.id === id);
      if (!item || item.read_at) return;
      try {
        await api.notifications.markRead(id);
        setNotifications((current) =>
          current.map((entry) =>
            entry.id === id ? { ...entry, read_at: new Date().toISOString() } : entry,
          ),
        );
        setUnread((current) => ({
          total: Math.max(0, current.total - 1),
          messages: Math.max(0, current.messages - (item.kind === "message" ? 1 : 0)),
        }));
      } catch {
        await refresh();
      }
    },
    [notifications, refresh],
  );

  const snapshotVisible = useCallback(() => {
    snapshotThrough.current = notifications[0]?.id ?? null;
  }, [notifications]);

  const markAllRead = useCallback(
    async (throughId?: number) => {
      const through = throughId ?? snapshotThrough.current ?? notifications[0]?.id;
      if (!through) return;
      try {
        await api.notifications.markThrough(through);
        setNotifications((current) =>
          current.map((entry) =>
            entry.id <= through && !entry.read_at
              ? { ...entry, read_at: new Date().toISOString() }
              : entry,
          ),
        );
        await refresh();
      } catch {
        // The next poll reflects the server state.
      }
    },
    [notifications, refresh],
  );

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications,
      unread,
      syncing,
      refresh,
      loadOlder,
      hasMore,
      markOne,
      markAllRead,
      snapshotVisible,
    }),
    [notifications, unread, syncing, refresh, loadOlder, hasMore, markOne, markAllRead, snapshotVisible],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error("useNotifications must be used inside NotificationsProvider");
  return context;
}
