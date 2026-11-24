import { PlanMessage } from "../../components/plans/PlanMessage";
import { DatePlanner } from "../../components/plans/DatePlanner";
import { ConversationMenu } from "./ConversationMenu";
import { CallButtons } from "../../components/calls/CallButtons";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError, type ChatGif, type Conversation, type Message, type MessageReceipts } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationsContext";
import { useToast } from "../../context/ToastContext";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { EmptyState, ErrorBanner, Spinner } from "../../components/ui/Misc";
import { clockTime, dayLabel, fullName, uuid } from "../../utils/format";

import { groupMessages } from "./groupMessages";
import { GifPicker } from "./GifPicker";
import { useReadMessages } from "./useReadMessages";

interface PendingMessage {
  client_id: string;
  body: string;
  kind: "text" | "gif";
  media_url?: string;
  media_alt?: string | null;
  failed?: boolean;
}

interface ChatThreadProps {
  conversation: Conversation | undefined;
  userId: number;
  onAccessLost: () => void;
  onConversationUpdate: () => void;
}

const PAGE_SIZE = 50;
const POLL_MS = 2000;

export function ChatThread({ conversation, userId, onAccessLost, onConversationUpdate }: ChatThreadProps) {
  const { user } = useAuth();
  const { notify } = useToast();
  const { notifications, markOne } = useNotifications();
  const [receipts, setReceipts] = useState<MessageReceipts>({ delivered_through: 0, read_through: 0 });
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useSearchParams();
  const plansOpen = search.get("plans") === "1";
  const setPlansOpen = useCallback((open: boolean) => {
    const next = new URLSearchParams(search);
    if (open) next.set("plans", "1");
    else next.delete("plans");
    setSearch(next, { replace: true });
  }, [search, setSearch]);
  const [gifOpen, setGifOpen] = useState(false);
  const oldestId = useRef<number | null>(null);
  const lastId = useRef<number | null>(null);
  const inFlight = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [viewingLatest, setViewingLatest] = useState(true);

  useReadMessages(userId, messages, Boolean(conversation) && !loading && viewingLatest);

  const merge = useCallback((incoming: Message[]) => {
    if (incoming.length === 0) return;
    const byId = new Map<number, Message>();
    setMessages((current) => {
      for (const message of current) byId.set(message.id, message);
      for (const message of incoming) byId.set(message.id, message);
      return [...byId.values()].sort((a, b) => a.id - b.id);
    });
    const ids = incoming.map((message) => message.id);
    const clientIds = new Set(incoming.map((message) => message.client_id));
    setPending((current) => current.filter((item) => !clientIds.has(item.client_id)));
    lastId.current = Math.max(lastId.current ?? 0, ...ids);
    oldestId.current = Math.min(oldestId.current ?? Infinity, ...ids);
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessages([]);
    setPending([]);
    oldestId.current = null;
    lastId.current = null;
    try {
      const page = await api.chat.messages(userId, { limit: PAGE_SIZE });
      lastId.current = 0;
      merge(page.messages);
      if (page.receipts) setReceipts(page.receipts);
      setHasMore(page.messages.length === PAGE_SIZE);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 403) {
        onAccessLost();
        return;
      }
      setError(cause instanceof Error ? cause.message : "Unable to load this conversation.");
    } finally {
      setLoading(false);
    }
  }, [userId, merge, onAccessLost]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const poll = useCallback(async () => {
    if (inFlight.current || lastId.current === null) return;
    if (!navigator.onLine) return;
    inFlight.current = true;
    try {
      let after = lastId.current;
      for (let round = 0; round < 5; round += 1) {
        const page = await api.chat.messages(userId, { after, limit: 100 });
        if (page.receipts) setReceipts(page.receipts);
        if (page.messages.length === 0) break;
        merge(page.messages);
        const newest = Math.max(...page.messages.map((message) => message.id));
        if (newest <= after) break;
        after = newest;
        onConversationUpdate();
        if (page.messages.length < 100) break;
      }
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 403) onAccessLost();
    } finally {
      inFlight.current = false;
    }
  }, [userId, merge, onAccessLost, onConversationUpdate]);

  useEffect(() => {
    const interval = window.setInterval(() => void poll(), POLL_MS);
    const onFocus = () => void poll();
    const onOnline = () => void poll();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void poll();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [poll]);

  const loadOlder = async () => {
    if (oldestId.current === null || !hasMore || inFlight.current) return;
    inFlight.current = true;
    try {
      const page = await api.chat.messages(userId, { before: oldestId.current, limit: PAGE_SIZE });
      if (page.messages.length > 0) {
        const byId = new Map<number, Message>();
        setMessages((current) => {
          for (const message of page.messages) byId.set(message.id, message);
          for (const message of current) byId.set(message.id, message);
          return [...byId.values()].sort((a, b) => a.id - b.id);
        });
        oldestId.current = Math.min(...page.messages.map((message) => message.id));
      }
      setHasMore(page.messages.length === PAGE_SIZE);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Unable to load older messages.", "error");
    } finally {
      inFlight.current = false;
    }
  };

  const dispatch = async (item: PendingMessage) => {
    setSending(true);
    try {
      const message = await api.chat.send(
        userId,
        item.kind === "gif"
          ? {
              kind: "gif",
              body: item.body,
              client_id: item.client_id,
              media_url: item.media_url!,
              ...(item.media_alt ? { media_alt: item.media_alt } : {}),
            }
          : { body: item.body, client_id: item.client_id },
      );
      merge([message]);
      onConversationUpdate();
      void poll();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 403) {
        onAccessLost();
        return;
      }
      setPending((current) =>
        current.map((entry) => (entry.client_id === item.client_id ? { ...entry, failed: true } : entry)),
      );
      notify(cause instanceof Error ? cause.message : "Message not sent.", "error");
    } finally {
      setSending(false);
    }
  };

  const send = (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || body.length > 2000) return;
    const item: PendingMessage = { client_id: uuid(), body, kind: "text" };
    setPending((current) => [...current, item]);
    setDraft("");
    scrollToBottom(true);
    void dispatch(item);
  };

  const sendGif = (gif: ChatGif) => {
    const item: PendingMessage = {
      client_id: uuid(),
      body: "",
      kind: "gif",
      media_url: gif.url,
      media_alt: gif.title,
    };
    setPending((current) => [...current, item]);
    setGifOpen(false);
    scrollToBottom(true);
    void dispatch(item);
  };

  const relatedUnread = notifications.filter(
    (entry) => (entry.kind === "message" || entry.kind === "plan") && entry.actor_id === userId && !entry.read_at,
  );

  const unreadMessages = relatedUnread.reduce((count, item) => count + item.unread_count, 0);

  const markRead = async () => {
    await Promise.all(relatedUnread.map((entry) => markOne(entry.id)));
    notify("Messages marked as read.", "success");
  };

  const scrollToBottom = useCallback((force = false) => {
    const element = scrollRef.current;
    if (!element) return;
    if (force) {
      atBottom.current = true;
      setViewingLatest(true);
    }
    const scroll = () => {
      if (!atBottom.current) return;
      element.scrollTop = element.scrollHeight;
    };
    scroll();
    requestAnimationFrame(scroll);
    window.setTimeout(scroll, 60);
    window.setTimeout(scroll, 180);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, pending, scrollToBottom]);

  const onScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
    setViewingLatest(atBottom.current);
  };

  if (!conversation) {
    return (
      <div className="chat-thread chat-thread--empty">
        <EmptyState
          icon={<Icon name="message" size={26} />}
          title="Conversation unavailable"
          description="This chat may have been closed because a like was removed or someone was blocked."
        />
      </div>
    );
  }

  let previousDay = "";

  return (
    <section className="chat-thread" aria-label={`Conversation with ${fullName(conversation)}`}>
      <header className="chat-thread__head">
        <Link to="/chat" className="chat-thread__back" aria-label="Back to conversations">
          <Icon name="chevronLeft" size={17} /><span>Conversations</span>
        </Link>
        <Link to={`/profile/${userId}`} className="chat-thread__person">
          <Avatar photoId={conversation.photo_id} name={conversation} size="sm" online={conversation.online} />
          <span>
            <strong>{fullName(conversation)} {conversation.online ? <span className="chat-thread__online">Online now</span> : null}</strong>
            <small>@{conversation.username} <span>·</span> <b>View profile</b></small>
          </span>
        </Link>
        <div className="chat-thread__controls">
          <button type="button" className="icon-button" aria-label="Date plans" title="Plan a date" onClick={() => setPlansOpen(true)}><Icon name="calendar" size={19} /></button>
          <CallButtons userId={userId} />
          <ConversationMenu userId={userId} name={fullName(conversation)} onBlocked={onConversationUpdate} />
        </div>
        {relatedUnread.length > 0 ? (
          <button type="button" className="link-button" onClick={() => void markRead()}>
            Mark {unreadMessages} read
          </button>
        ) : null}
      </header>

      <DatePlanner userId={userId} name={fullName(conversation)} onAccessLost={onAccessLost} open={plansOpen} onOpenChange={setPlansOpen} onChanged={() => void poll()} />

      {error ? <ErrorBanner message={error} onRetry={() => void loadInitial()} /> : null}

      <div className="chat-thread__scroll" ref={scrollRef} onScroll={onScroll}>
        {loading ? <div className="results-loader"><Spinner label="Loading messages" /></div> : null}

        {hasMore ? (
          <div className="chat-thread__older">
            <button type="button" className="link-button" onClick={() => void loadOlder()}>Load older messages</button>
          </div>
        ) : null}

        {!loading && messages.length === 0 && pending.length === 0 ? (
          <div className="chat-thread__start">
            <Icon name="spark" size={28} />
            <p>You're connected. Say something nice to {conversation.first_name}.</p>
          </div>
        ) : null}

        {groupMessages(messages).map((group) => {
          const first = group[0]!;
          const last = group[group.length - 1]!;
          const day = dayLabel(first.created_at);
          const showDay = day !== previousDay;
          previousDay = day;
          const mine = first.sender_id === user?.id;
          const status = last.id <= receipts.read_through ? "Read"
            : last.id <= receipts.delivered_through ? "Delivered" : "Sent";
          return (
            <div key={first.id} className="chat-message-group">
              {showDay ? <div className="chat-day"><span>{day}</span></div> : null}
              <div className={`message-group${mine ? " message-group--mine" : ""}`}>
                {!mine ? <Avatar photoId={conversation.photo_id} name={conversation} size="sm" /> : null}
                <div className="message-group__content">
                  {group.map((message) => (
                    <div key={message.id} className={`bubble${mine ? " bubble--mine" : ""}${message.kind === "gif" ? " bubble--media" : ""}${message.plan_id ? " bubble--plan" : ""}`}>
                      {message.plan_id ? <PlanMessage message={message} onOpen={() => setPlansOpen(true)} /> : message.kind === "gif" && message.media_url ? (
                        <figure className="bubble__media">
                          <img src={message.media_url} alt={message.media_alt || "GIF"} loading="lazy" onLoad={() => scrollToBottom()} />
                          {message.body ? <figcaption>{message.body}</figcaption> : null}
                        </figure>
                      ) : <p>{message.body}</p>}
                    </div>
                  ))}
                  <div className="message-group__meta">
                    <time className="message-group__time" dateTime={last.created_at}>{clockTime(last.created_at)}</time>
                    {mine ? <span className={`message-receipt message-receipt--${status.toLowerCase()}`} role="img" aria-label={status} title={status}>
                      <Icon name="check" size={14} strokeWidth={2} />
                      {status !== "Sent" ? <Icon name="check" size={14} strokeWidth={2} /> : null}
                    </span> : null}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {pending.map((item) => (
          <div key={item.client_id} className={`bubble bubble--mine${item.failed ? " bubble--failed" : ""}${item.kind === "gif" ? " bubble--media" : ""}`}>
            {item.kind === "gif" && item.media_url ? (
              <figure className="bubble__media">
                <img src={item.media_url} alt={item.media_alt || "GIF"} loading="lazy" onLoad={() => scrollToBottom()} />
                {item.body ? <figcaption>{item.body}</figcaption> : null}
              </figure>
            ) : (
              <p>{item.body}</p>
            )}
            <time>{item.failed ? "Not sent" : "Sending…"}</time>
            {item.failed ? (
              <button type="button" className="link-button" onClick={() => void dispatch(item)}>Retry</button>
            ) : null}
          </div>
        ))}
      </div>

      <form className="chat-compose" onSubmit={send}>
        <div className="chat-compose__tools">
          <button
            type="button"
            className={`icon-button chat-compose__gif${gifOpen ? " is-active" : ""}`}
            aria-label="Add GIF"
            aria-expanded={gifOpen}
            onClick={() => setGifOpen((value) => !value)}
          >
            <Icon name="image" size={18} />
          </button>
          <GifPicker open={gifOpen} onClose={() => setGifOpen(false)} onPick={sendGif} />
        </div>
        <div className="chat-compose__field">
          <textarea
            className="input textarea"
            rows={1}
            value={draft}
            maxLength={2000}
            placeholder="Write a message…"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!sending && draft.trim()) event.currentTarget.form?.requestSubmit();
              }
            }}
            aria-label="Message"
          />
          {draft.length > 1800 ? (
            <span className="chat-compose__count">{draft.length}/2000</span>
          ) : null}
        </div>
        <Button type="submit" disabled={!draft.trim() || sending} loading={sending} icon={<Icon name="send" size={18} />}>
          Send
        </Button>
      </form>
    </section>
  );
}
