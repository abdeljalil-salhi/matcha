import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/Misc";
import { useNotifications } from "../context/NotificationsContext";
import { NOTIFICATION_COPY, notificationTarget } from "../data/notifications";
import { relativeTime } from "../utils/format";
import { Icon } from "../components/ui/Icon";

export function NotificationsPage() {
  const navigate = useNavigate();
  const { notifications, unread, hasMore, loadOlder, markOne, markAllRead } = useNotifications();

  return (
    <div className="notifications-page container">
      <header className="page-heading page-heading--row">
        <div>
          <p className="eyebrow">What's happening</p>
          <h1>Notifications</h1>
          <p className="lead">Likes, visits, new connections and messages — all in one place.</p>
        </div>
        {unread.total > 0 ? (
          <Button variant="secondary" onClick={() => void markAllRead(notifications[0]?.id)}>Mark all as read</Button>
        ) : null}
      </header>

      {notifications.length === 0 ? (
        <EmptyState
          icon={<Icon name="bell" size={26} />}
          title="Nothing new yet"
          description="When someone likes or visits your profile, you'll see it here — usually within seconds."
        />
      ) : (
        <ul className="notification-feed">
          {notifications.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`notification-feed__item${item.read_at ? "" : " is-unread"}`}
                onClick={() => {
                  void markOne(item.id);
                  navigate(notificationTarget(item));
                }}
              >
                <span className={`notification-item__icon notification-item__icon--${item.kind}`}>
                  <Icon name={NOTIFICATION_COPY[item.kind].icon} size={17} />
                </span>
                <span className="notification-feed__body">
                  <strong>{item.actor_username}</strong> {NOTIFICATION_COPY[item.kind].page}
                  <small className="text-muted">{relativeTime(item.created_at)}</small>
                </span>
                {item.read_at ? null : <span className="notification-item__dot" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasMore && notifications.length > 0 ? (
        <div className="results-more">
          <Button variant="secondary" onClick={() => void loadOlder()}>Load older notifications</Button>
        </div>
      ) : null}
    </div>
  );
}
