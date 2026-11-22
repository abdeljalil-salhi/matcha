import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Icon } from "../components/ui/Icon";

export function LandingPage() {
  const { user, signOut } = useAuth();

  return (
    <div className="landing">
      <header className="landing__nav container">
        <Link to="/" className="brand">
          <span className="brand__mark" aria-hidden="true">m</span>
          <span className="brand__word">matcha</span>
        </Link>
        <div className="landing__nav-actions">
          {user ? (
            <>
              <button type="button" className="btn btn--ghost btn--md" onClick={() => void signOut()}>
                Sign out
              </button>
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

      <main>
        <section className="hero container">
          <div className="hero__copy">
            <p className="eyebrow">Dating, with better taste</p>
            <h1>Meet people who feel like <em>your</em> kind of people.</h1>
            <p className="lead">
              Real common ground, a real sense of distance, and enough detail to start a
              conversation that doesn't feel like a cold open.
            </p>
            <div className="hero__actions">
              <Link to={user ? "/discover" : "/register"} className="btn btn--primary btn--lg">
                {user ? "Explore profiles" : "Find your match"}
              </Link>
              {!user ? (
                <Link to="/login" className="btn btn--secondary btn--lg">I already have an account</Link>
              ) : null}
            </div>
            <p className="hero__note">Free to use · Location only with your consent · No noise</p>
          </div>
          <div className="hero__art" aria-hidden="true">
            <div className="hero__card hero__card--one">
              <span className="hero__avatar">A</span>
              <div><strong>Amélie, 27</strong><small>Montmartre · 2 km away</small></div>
              <span className="hero__pill"><Icon name="heart" size={12} /> 3 shared</span>
            </div>
            <div className="hero__circle hero__circle--outer" />
            <div className="hero__circle hero__circle--inner" />
            <div className="hero__card hero__card--two">
              <span className="hero__avatar hero__avatar--alt">J</span>
              <div><strong>Jules, 29</strong><small>Jazz · Climbing · Vegan</small></div>
              <span className="hero__pill hero__pill--green">Online</span>
            </div>
          </div>
        </section>

        <section className="landing__features container">
          <div className="landing__section-head">
            <p className="eyebrow">How it works</p>
            <h2>Less swiping. More signal.</h2>
          </div>
          <div className="feature-grid">
            <article className="feature-card">
              <span className="feature-card__icon"><Icon name="compass" size={20} /></span>
              <h3>People, ranked with intention</h3>
              <p>Distance, shared interests and fame shape your suggestions — no endless deck of strangers.</p>
            </article>
            <article className="feature-card">
              <span className="feature-card__icon"><Icon name="heart" size={20} /></span>
              <h3>A match opens the door</h3>
              <p>Chat unlocks only when the feeling is mutual, so every conversation starts with something already there.</p>
            </article>
            <article className="feature-card">
              <span className="feature-card__icon"><Icon name="shield" size={20} /></span>
              <h3>Your boundaries, respected</h3>
              <p>Approximate location only. Blocks and reports are one tap away, always.</p>
            </article>
          </div>
        </section>

        <section className="landing__cta container">
          <div>
            <h2>Your person might be around the corner.</h2>
            <p className="lead">Join Matcha and see who's nearby.</p>
          </div>
          <Link to={user ? "/discover" : "/register"} className="btn btn--primary btn--lg">
            {user ? "Discover people" : "Create an account"}
          </Link>
        </section>
      </main>

      <footer className="landing__footer container">
        <span>© {new Date().getFullYear()} Matcha</span>
        <span>A quieter way to meet people nearby.</span>
      </footer>
    </div>
  );
}
