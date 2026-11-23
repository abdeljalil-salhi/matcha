import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationsContext";
import { fullName } from "../../utils/format";
import { Avatar } from "../ui/Avatar";
import { Icon, type IconName } from "../ui/Icon";
import { SessionActions } from "./SessionActions";

const NAV_ITEMS: { to: string; label: string; icon: IconName }[] = [
  { to: "/discover", label: "Discover", icon: "compass" },
  { to: "/search", label: "Search", icon: "search" },
  { to: "/map", label: "Map", icon: "pin" },
  { to: "/likes", label: "Likes", icon: "heart" },
  { to: "/visitors", label: "Visitors", icon: "eye" },
  { to: "/chat", label: "Messages", icon: "message" },
];

export function AppShell() {
  const { user } = useAuth();
  const { unread } = useNotifications();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userTriggerRef = useRef<HTMLButtonElement>(null);
  const userPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) setUserOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setUserOpen(false);
      userTriggerRef.current?.focus();
    };
    const focusFrame = window.requestAnimationFrame(() => {
      userPanelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    });
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [userOpen]);

  if (!user) return null;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="app-header">
        <div className="container app-header__inner">
          <Link to="/discover" className="brand" aria-label="Matcha home" onClick={() => setMobileOpen(false)}>
            <span className="brand__mark" aria-hidden="true">m</span>
            <span className="brand__word">matcha</span>
          </Link>

          <nav className="main-nav" aria-label="Main navigation">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `main-nav__link${isActive ? " is-active" : ""}`}
              >
                <Icon name={item.icon} size={17} className="main-nav__icon" />
                <span>{item.label}</span>
                {item.to === "/chat" && unread.messages > 0 ? (
                  <span className="main-nav__badge">{unread.messages}</span>
                ) : null}
              </NavLink>
            ))}
          </nav>

          <div className="app-header__actions">
            <SessionActions />
            <div className="user-menu" ref={userMenuRef}>
              <button
                ref={userTriggerRef}
                type="button"
                className="user-menu__trigger"
                onClick={() => setUserOpen((current) => !current)}
                aria-expanded={userOpen}
                aria-controls={userOpen ? "account-menu" : undefined}
                aria-label="Account menu"
              >
                <Avatar photoId={user.photos.find((photo) => photo.is_primary)?.id} name={user} size="sm" />
                <span className="user-menu__name">{user.first_name || user.username}</span>
                <Icon name="chevronDown" size={14} className="user-menu__chevron" />
              </button>
              {userOpen ? (
                <div className="user-menu__panel" id="account-menu" ref={userPanelRef} aria-label="Account menu">
                  <div className="user-menu__identity">
                    <strong>{fullName(user)}</strong>
                    <span className="text-muted text-small">@{user.username}</span>
                  </div>
                  <Link to="/profile/me" onClick={() => setUserOpen(false)}>
                    My profile
                  </Link>
                  <Link to="/settings" onClick={() => setUserOpen(false)}>
                    Settings
                  </Link>
                  {!user.complete ? (
                    <Link to="/onboarding" onClick={() => setUserOpen(false)}>
                      Finish setup
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="icon-button mobile-toggle"
              onClick={() => setMobileOpen((current) => !current)}
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
            >
              <Icon name="menu" size={20} />
            </button>
          </div>
        </div>

        {mobileOpen ? (
          <nav className="mobile-nav" aria-label="Mobile navigation">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `mobile-nav__link${isActive ? " is-active" : ""}`}
                onClick={() => setMobileOpen(false)}
              >
                <Icon name={item.icon} size={19} />
                <span>{item.label}</span>
                {item.to === "/chat" && unread.messages > 0 ? (
                  <span className="main-nav__badge">{unread.messages}</span>
                ) : null}
              </NavLink>
            ))}
            <NavLink to="/profile/me" className="mobile-nav__link" onClick={() => setMobileOpen(false)}>
              <Icon name="user" size={19} /> My profile
            </NavLink>
            <NavLink to="/settings" className="mobile-nav__link" onClick={() => setMobileOpen(false)}>
              <Icon name="sliders" size={19} /> Settings
            </NavLink>
          </nav>
        ) : null}
      </header>

      <main className="app-main" id="main-content">
        <Outlet />
      </main>

      <footer className="app-footer">
        <div className="container app-footer__inner">
          <span><strong>matcha</strong> — a quieter way to meet people nearby.</span>
          <span className="app-footer__links">
            <Link to="/map">People map</Link>
            <Link to="/settings">Account settings</Link>
            <Link to="/blocks">Blocked accounts</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
