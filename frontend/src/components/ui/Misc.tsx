import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function EmptyState({
  icon = <Icon name="compass" size={26} />,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      {description ? <p className="text-muted">{description}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}

export function TagList({
  tags,
  onSelect,
  active,
  limit,
}: {
  tags: string[];
  onSelect?: (tag: string) => void;
  active?: string[];
  limit?: number;
}) {
  const visible = limit ? tags.slice(0, limit) : tags;
  return (
    <ul className="tag-list">
      {visible.map((tag) => (
        <li key={tag}>
          {onSelect ? (
            <button
              type="button"
              className={`tag-chip tag-chip--button${active?.includes(tag) ? " tag-chip--active" : ""}`}
              onClick={() => onSelect(tag)}
              aria-pressed={active?.includes(tag) ?? false}
            >
              #{tag}
            </button>
          ) : (
            <span className={`tag-chip${active?.includes(tag) ? " tag-chip--active" : ""}`}>#{tag}</span>
          )}
        </li>
      ))}
      {limit && tags.length > limit ? <li className="tag-list__more">+{tags.length - limit}</li> : null}
    </ul>
  );
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function Presence({ online, lastSeen }: { online: boolean; lastSeen?: string | null }) {
  if (online) {
    return <span className="presence presence--online"><span />Online now</span>;
  }
  return <span className="presence">Last seen {lastSeen ? new Date(lastSeen).toLocaleString() : "recently"}</span>;
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-banner" role="alert">
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className="link-button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
