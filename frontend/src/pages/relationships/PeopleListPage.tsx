import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, type BlockedUser, type PersonSummary } from "../../api";
import { useToast } from "../../context/ToastContext";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { EmptyState, ErrorBanner, Spinner } from "../../components/ui/Misc";
import { fullName, relativeTime } from "../../utils/format";

type Mode = "likes" | "visitors" | "blocks";

const COPY: Record<Mode, { eyebrow: string; title: string; subtitle: string; empty: string }> = {
  likes: {
    eyebrow: "Your audience",
    title: "People who like you",
    subtitle: "Mutual likes unlock a conversation. Say hello to someone you like back.",
    empty: "Nobody has liked you yet. Keep your profile lively and check back soon.",
  },
  visitors: {
    eyebrow: "Your audience",
    title: "Recent visitors",
    subtitle: "These people stopped by your profile.",
    empty: "No visits yet. A fresh photo and a thoughtful bio help you get noticed.",
  },
  blocks: {
    eyebrow: "Account settings",
    title: "Blocked accounts",
    subtitle: "Blocked people can't find you, notify you, or message you.",
    empty: "You haven't blocked anyone.",
  },
};

const PAGE_SIZE = 25;

export function PeopleListPage({ mode }: { mode: Mode }) {
  const { notify } = useToast();
  const [items, setItems] = useState<(PersonSummary | BlockedUser)[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unblocking, setUnblocking] = useState<number | null>(null);
  const offsetRef = useRef(0);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const copy = COPY[mode];

  const load = useCallback(
    async (reset: boolean, requestId = generation.current) => {
      if (inFlight.current) return;
      inFlight.current = true;
      const offset = reset ? 0 : offsetRef.current;
      setLoading(true);
      setError(null);
      try {
        const result =
          mode === "likes"
            ? await api.relationships.likes({ limit: PAGE_SIZE, offset })
            : mode === "visitors"
              ? await api.relationships.visitors({ limit: PAGE_SIZE, offset })
              : await api.relationships.blocks({ limit: PAGE_SIZE, offset });
        if (requestId !== generation.current) return;
        const page =
          "likes" in result ? result.likes : "visitors" in result ? result.visitors : result.blocks;
        setItems((current) => (reset ? page : [...current, ...page]));
        offsetRef.current = offset + page.length;
        setHasMore(page.length === PAGE_SIZE);
      } catch (cause) {
        if (requestId !== generation.current) return;
        setError(cause instanceof Error ? cause.message : "Unable to load this list.");
      } finally {
        if (requestId === generation.current) {
          inFlight.current = false;
          setLoading(false);
        }
      }
    },
    [mode],
  );

  useEffect(() => {
    generation.current += 1;
    inFlight.current = false;
    offsetRef.current = 0;
    void load(true, generation.current);
  }, [load]);

  const unblock = async (id: number) => {
    setUnblocking(id);
    try {
      await api.relationships.unblock(id);
      setItems((current) => current.filter((item) => item.id !== id));
      notify("User unblocked.", "success");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Unable to unblock this user.", "error");
    } finally {
      setUnblocking(null);
    }
  };

  return (
    <div className="people-page container">
      <header className="page-heading">
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p className="lead">{copy.subtitle}</p>
      </header>

      {error ? <ErrorBanner message={error} onRetry={() => void load(true)} /> : null}

      {loading && items.length === 0 && !error ? (
        <div className="results-loader"><Spinner label="Loading people" /></div>
      ) : null}

      {!loading && items.length === 0 && !error ? (
        <EmptyState
          icon={<Icon name={mode === "likes" ? "heart" : mode === "visitors" ? "eye" : "block"} size={26} />}
          title="Nothing here yet"
          description={copy.empty}
        />
      ) : null}

      {items.length > 0 ? (
        <ul className="people-list">
          {items.map((item) => {
            const person = item as PersonSummary;
            const timestamp = mode === "likes" ? person.created_at : person.last_viewed_at;
            return (
              <li key={item.id} className="person-row card">
                <Avatar photoId={person.photo_id} name={item} size="md" />
                <div className="person-row__info">
                  <strong>{"first_name" in item ? fullName(item) : item.username}</strong>
                  <span className="text-small text-muted">
                    @{item.username}
                    {timestamp ? ` · ${relativeTime(timestamp)}` : ""}
                  </span>
                  {mode === "likes" && person.connected ? (
                    <span className="status-badge status-badge--match">
                      <Icon name="star" size={12} /> Connected — chat available
                    </span>
                  ) : null}
                </div>
                <div className="person-row__actions">
                  {mode === "blocks" ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={unblocking === item.id}
                      onClick={() => void unblock(item.id)}
                    >
                      Unblock
                    </Button>
                  ) : (
                    <Link to={`/profile/${item.id}`} className="btn btn--secondary btn--sm">View profile</Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {hasMore ? (
        <div className="results-more">
          <Button variant="secondary" loading={loading} onClick={() => void load(false)}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
