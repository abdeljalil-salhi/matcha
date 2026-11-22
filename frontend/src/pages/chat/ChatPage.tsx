import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Conversation } from "../../api";
import { useNotifications } from "../../context/NotificationsContext";
import { useToast } from "../../context/ToastContext";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { EmptyState, ErrorBanner, Spinner } from "../../components/ui/Misc";
import { clockTime, fullName } from "../../utils/format";
import { ChatThread } from "./ChatThread";

export function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notifications, refresh: refreshNotifications } = useNotifications();
  const { notify } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userId = Number(id);

  const loadConversations = useCallback(async () => {
    try {
      const result = await api.chat.conversations({ limit: 100 });
      setConversations(result.conversations);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load conversations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void loadConversations();
    }, 4000);
    const onFocus = () => void loadConversations();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadConversations]);

  const onAccessLost = useCallback(() => {
    notify("This conversation is no longer available.", "info");
    void refreshNotifications();
    void loadConversations();
    navigate("/chat", { replace: true });
  }, [navigate, refreshNotifications, loadConversations, notify]);

  const onConversationUpdate = useCallback(() => {
    void loadConversations();
  }, [loadConversations]);

  const unreadFor = (id: number) =>
    notifications.filter((item) => item.kind === "message" && item.actor_id === id && !item.read_at).length;

  const conversation = conversations.find((entry) => entry.id === userId);
  const fallback: Conversation = {
    id: userId,
    username: "member",
    first_name: "New",
    last_name: "connection",
    photo_id: null,
    latest_message_id: null,
    latest_message_at: null,
  };
  const active = Number.isInteger(userId) && userId > 0 ? (conversation ?? fallback) : undefined;

  return (
    <div className="chat-page container">
      <header className="page-heading page-heading--compact">
        <p className="eyebrow">Messages</p>
        <h1>Your conversations</h1>
      </header>

      {error ? <ErrorBanner message={error} onRetry={() => void loadConversations()} /> : null}

      <div className={`chat-layout${active ? " chat-layout--thread" : ""}`}>
        <aside className="conversation-list card">
          {loading ? <div className="results-loader"><Spinner label="Loading conversations" /></div> : null}
          {!loading && conversations.length === 0 && !error ? (
            <EmptyState
              icon={<Icon name="message" size={26} />}
              title="No conversations yet"
              description="When you and someone else like each other, your chat appears here."
              action={<Link to="/discover" className="btn btn--secondary btn--sm">Discover people</Link>}
            />
          ) : null}
          {conversations.map((entry) => (
            <Link
              key={entry.id}
              to={`/chat/${entry.id}`}
              className={`conversation-row${entry.id === userId ? " is-active" : ""}`}
            >
              <Avatar photoId={entry.photo_id} name={entry} size="md" />
              <span className="conversation-row__body">
                <strong>{fullName(entry)}</strong>
                <span className="conversation-row__preview">
                  {entry.latest_message_at ? "View latest message" : "New connection — say hello"}
                </span>
              </span>
              {unreadFor(entry.id) > 0 ? (
                <span className="conversation-row__unread" aria-label={`${unreadFor(entry.id)} unread messages`}>
                  {unreadFor(entry.id)}
                </span>
              ) : entry.latest_message_at ? (
                <span className="conversation-row__time">{clockTime(entry.latest_message_at)}</span>
              ) : null}
            </Link>
          ))}
        </aside>

        {active ? (
          <ChatThread
            key={active.id}
            conversation={conversation ?? active}
            userId={active.id}
            onAccessLost={onAccessLost}
            onConversationUpdate={onConversationUpdate}
          />
        ) : (
          <div className="chat-placeholder card">
            <Icon name="message" size={34} />
            <h2>Choose a conversation</h2>
            <p className="text-muted">Your messages with connected members appear on the left.</p>
            <Button variant="secondary" onClick={() => void loadConversations()}>Refresh conversations</Button>
          </div>
        )}
      </div>
    </div>
  );
}
