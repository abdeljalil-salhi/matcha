import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationsContext";
import { Icon } from "../ui/Icon";
import { NotificationMenu } from "./NotificationMenu";
import { SignOutButton } from "./SignOutButton";

/** Keep unread messages, notifications, and direct logout available together. */
export function SessionActions() {
  const { user } = useAuth();
  const { unread } = useNotifications();
  if (!user) return null;

  return (
    <div className="session-actions" aria-label="Session controls">
      <Link
        to="/chat"
        className="icon-button session-actions__messages"
        aria-label={`Messages${unread.messages ? `, ${unread.messages} unread` : ""}`}
        title="Messages"
      >
        <Icon name="message" size={19} />
        {unread.messages > 0 ? (
          <span className="notification-menu__badge">{unread.messages > 99 ? "99+" : unread.messages}</span>
        ) : null}
      </Link>
      <NotificationMenu />
      <SignOutButton className="icon-button icon-button--danger" />
    </div>
  );
}

/** Give standalone account and error pages the authenticated session controls. */
export function SignedInHeader() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <header className="standalone-session-header">
      <div className="container standalone-session-header__inner">
        <Link to="/discover" className="brand">matcha</Link>
        <SessionActions />
      </div>
    </header>
  );
}
