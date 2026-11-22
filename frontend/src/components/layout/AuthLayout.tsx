import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";

interface AuthLayoutProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  dissolving?: boolean;
  pillLabel?: string;
}

const ROWS = 12;
const COLS = 10;

function noise(index: number): number {
  const value = Math.sin((index + 1) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

const PIXEL_CELLS = Array.from({ length: ROWS * COLS }, (_, index) => {
  const row = Math.floor(index / COLS);
  const fromBottom = ROWS - 1 - row;
  const jitter = noise(index);
  return {
    delay: fromBottom * 16 + jitter * 28,
    alpha: 0.28 + jitter * 0.64,
    lift: 105 + jitter * 24,
  };
});

export function AuthLayout({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  dissolving = false,
  pillLabel = "Continue",
}: AuthLayoutProps) {
  return (
    <div className={`auth-layout${dissolving ? " is-dissolving" : ""}`}>
      <aside className="auth-aside">
        <Link to="/" className="brand brand--light">
          <span className="brand__mark" aria-hidden="true">m</span>
          <span className="brand__word">matcha</span>
        </Link>
        <div className="auth-aside__content">
          <p className="eyebrow eyebrow--light">A better kind of meeting</p>
          <h2>Good chemistry starts with the little things.</h2>
          <p>
            Shared playlists, the same corner of the city, a love of slow Sunday mornings.
            Matcha brings the right people into focus — without the noise.
          </p>
          <div className="auth-aside__stats">
            <div><strong>Nearby</strong><span>people, first</span></div>
            <div><strong>Shared</strong><span>interests, always</span></div>
            <div><strong>Quiet</strong><span>by design</span></div>
          </div>
        </div>
        <p className="auth-aside__foot">Less noise. Better conversations.</p>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-card__surface" aria-hidden="true">
            <span className="auth-card__pill">{pillLabel}</span>
          </div>

          <div className="auth-card__pixels" aria-hidden="true">
            {PIXEL_CELLS.map((cell, index) => (
              <span
                key={index}
                style={
                  {
                    "--delay": `${cell.delay}ms`,
                    "--alpha": cell.alpha,
                    "--lift": `${cell.lift}%`,
                  } as CSSProperties
                }
              />
            ))}
          </div>

          <div className="auth-card__content">
            <div className="auth-card__intro">
              <p className="eyebrow">{eyebrow}</p>
              <h1>{title}</h1>
              <p className="lead">{subtitle}</p>
            </div>
            <div className="auth-card__body">{children}</div>
            {footer ? <div className="auth-card__footer">{footer}</div> : null}
          </div>
        </div>
      </main>
    </div>
  );
}
