import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Icon } from "../components/ui/Icon";
import { SessionActions } from "../components/layout/SessionActions";

export function LandingPage() {
  const { user } = useAuth();
  const exploreTo = user ? "/discover" : "/register";

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

      <main>
        <section className="hero container">
          <div className="hero__copy">
            <p className="eyebrow">Dating, with more intention</p>
            <h1>Meet people who feel<br />like <em>your</em> kind of people.</h1>
            <p className="lead">
              Thoughtful matching, real common ground, and people nearby who are also
              looking for a genuine connection.
            </p>
            <div className="hero__actions">
              <Link to={exploreTo} className="btn btn--primary btn--lg">Explore profiles</Link>
              <a href="#why-matcha" className="btn btn--secondary btn--lg hero__how">
                <Icon name="play" size={15} strokeWidth={2} /> See how Matcha works
              </a>
            </div>
            <ul className="hero__trust">
              <li><Icon name="pin" size={15} strokeWidth={2} /> People nearby</li>
              <li><Icon name="heart" size={15} strokeWidth={2} /> Shared interests</li>
              <li><Icon name="shieldPlain" size={15} strokeWidth={2} /> Privacy by design</li>
            </ul>
          </div>

          <div className="hero__art" aria-hidden="true">
            <div className="hero__rings" />
            <span className="hero__pin"><Icon name="pinSolid" size={30} /></span>

            <figure className="hero__card hero__card--one">
              <span className="hero__chip hero__chip--match">
                <Icon name="heart" size={13} strokeWidth={2.2} /> 92% match
              </span>
              <img src="/images/home-clara.webp" alt="" width={256} height={256} />
              <figcaption>
                <strong>Clara, 25</strong>
                <span className="fame-badge"><Icon name="star" size={12} strokeWidth={2.2} /> 88</span>
              </figcaption>
            </figure>

            <figure className="hero__card hero__card--two">
              <img src="/images/home-fatima.webp" alt="" width={256} height={256} />
              <figcaption>
                <strong>Fatima, 21</strong>
                <span className="fame-badge"><Icon name="star" size={12} strokeWidth={2.2} /> 48</span>
              </figcaption>
            </figure>

            <span className="hero__chip hero__chip--place">
              <Icon name="pin" size={16} strokeWidth={2.2} />
              <span><strong>Anfa, Casablanca</strong><small>Within 2 km</small></span>
            </span>

            <ul className="hero__interests">
              <li><Icon name="book" size={14} strokeWidth={2.2} /> Books</li>
              <li><Icon name="mountain" size={14} strokeWidth={2.2} /> Hiking</li>
              <li><Icon name="gamepad" size={14} strokeWidth={2.2} /> Gaming</li>
            </ul>
          </div>
        </section>

        <section className="landing__features container" id="why-matcha">
          <div className="landing__section-head">
            <p className="eyebrow">Why Matcha</p>
            <h2>A calmer, more thoughtful way to date.</h2>
          </div>
          <div className="feature-grid">
            <article className="feature-card">
              <span className="feature-card__icon"><Icon name="target" size={20} strokeWidth={2} /></span>
              <h3>Discover with intention</h3>
              <p>
                People are ranked by compatibility, shared interests, and proximity — so you
                spend less time swiping and more time meeting the right people.
              </p>
            </article>
            <article className="feature-card">
              <span className="feature-card__icon"><Icon name="shield" size={20} strokeWidth={2} /></span>
              <h3>Your privacy, respected</h3>
              <p>
                Control your visibility, location, and details. Matcha is built for real people
                and meaningful connections.
              </p>
            </article>
            <article className="feature-card">
              <span className="feature-card__icon"><Icon name="message" size={20} strokeWidth={2} /></span>
              <h3>Better conversations</h3>
              <p>
                Matches are based on genuine common ground, giving you an easy starting point
                for thoughtful, natural conversations.
              </p>
            </article>
          </div>
        </section>

        <section className="landing__cta container">
          <div>
            <h2>Find thoughtful people near you.</h2>
            <p className="lead">Create a profile and discover compatible people in your area.</p>
          </div>
          <Link to={exploreTo} className="btn btn--lg landing__cta-btn">
            Explore profiles <Icon name="arrowRight" size={16} strokeWidth={2.2} />
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
