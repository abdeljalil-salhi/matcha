import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { useNotifications } from "../../context/NotificationsContext";
import { NOTIFICATION_COPY, notificationCopy, notificationKey, notificationTarget } from "../../data/notifications";
import { relativeTime } from "../../utils/format";
import type { Notification } from "../../api";
import { Icon } from "../ui/Icon";

export function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { notifications, unread, loadOlder, hasMore, markOne, markAllRead, snapshotVisible } =
    useNotifications();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const focusFrame = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    });
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = () => {
    if (!open) snapshotVisible();
    setOpen((current) => !current);
  };

  const goTo = async (item: Notification) => {
    if (item.kind !== "message" && (item.kind !== "plan" || item.message_id === null)) await markOne(item.id);
    setOpen(false);
    navigate(notificationTarget(item));
  };

  return (
    <div className="notification-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`icon-button icon-button--bell${open ? " is-active" : ""}`}
        onClick={toggle}
        aria-label={`Notifications${unread.total ? `, ${unread.total} unread` : ""}`}
        aria-expanded={open}
        aria-controls={open ? "notification-popover" : undefined}
      >
        <Icon name="bell" size={19} />
        {unread.total > 0 ? (
          <span className="notification-menu__badge">{unread.total > 99 ? "99+" : unread.total}</span>
        ) : null}
      </button>

      {open ? (
        <div className="notification-menu__panel" id="notification-popover" ref={panelRef} aria-label="Notifications">
          <div className="notification-menu__head">
            <div>
              <strong>Notifications</strong>
              <span className="text-muted text-small">
                {unread.total > 0 ? `${unread.total} unread` : "You're all caught up"}
              </span>
            </div>
            {unread.total > 0 ? (
              <button type="button" className="link-button" onClick={() => void markAllRead()}>
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="notification-menu__list">
            {notifications.length === 0 ? (
              <div className="notification-menu__empty">
                <Icon name="bell" size={20} />
                <p>No notifications yet.</p>
                <p className="text-small text-muted">Likes, visits and messages will show up here.</p>
              </div>
            ) : (
              notifications.map((item) => (
                <button
                  key={notificationKey(item)}
                  type="button"
                  className={`notification-item${item.read_at ? "" : " notification-item--unread"}`}
                  onClick={() => void goTo(item)}
                >
                  <span className={`notification-item__icon notification-item__icon--${item.kind}`}>
                    <Icon name={NOTIFICATION_COPY[item.kind].icon} size={16} />
                  </span>
                  <span className="notification-item__body">
                    <span>
                      <strong>{item.actor_username}</strong> {notificationCopy(item, "menu")}
                    </span>
                    <span className="text-small text-muted">{relativeTime(item.created_at)}</span>
                  </span>
                  {item.read_at ? null : <span className="notification-item__dot" aria-hidden="true" />}
                </button>
              ))
            )}
            {hasMore && notifications.length > 0 ? (
              <button type="button" className="notification-menu__more" onClick={() => void loadOlder()}>
                Load older notifications
              </button>
            ) : null}
          </div>

          <div className="notification-menu__foot">
            <Link to="/notifications" onClick={() => setOpen(false)}>
              View all notifications →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
