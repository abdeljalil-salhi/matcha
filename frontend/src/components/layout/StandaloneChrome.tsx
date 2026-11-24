import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { SessionActions } from "./SessionActions";

/** Render the same navigation header used on the landing page. */
export function LandingHeader() {
  const { user } = useAuth();
  return (
    <header className="landing__nav container">
      <Link to="/" className="brand">
        <span className="brand__mark" aria-hidden="true">m</span>
        <span className="brand__word">matcha</span>
      </Link>
      <div className="landing__nav-actions">
        {user ? (
          <>
            <SessionActions />
            <Link to="/discover" className="btn btn--primary btn--md">Open Matcha</Link>
          </>
        ) : (
          <>
            <Link to="/login" className="btn btn--ghost btn--md">Sign in</Link>
            <Link to="/register" className="btn btn--primary btn--md">Get started</Link>
          </>
        )}
      </div>
    </header>
  );
}

/** Provide a page header for guests and authenticated users alike. */
export function StandaloneHeader() {
  const { user } = useAuth();
  return <header className="standalone-session-header">
    <div className="container standalone-session-header__inner">
      <Link to={user ? "/discover" : "/"} className="brand" aria-label="Matcha home">matcha</Link>
      {user ? <SessionActions /> : <Link to="/login">Log in</Link>}
    </div>
  </header>;
}

/** Keep standalone account and error pages consistent with the app landmarks. */
export function StandaloneFooter() {
  return <footer className="standalone-footer">
    <div className="container"><Link to="/">matcha</Link> — a quieter way to meet people nearby.</div>
  </footer>;
}
