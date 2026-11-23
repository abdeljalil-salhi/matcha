import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { SessionActions } from "./SessionActions";

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
