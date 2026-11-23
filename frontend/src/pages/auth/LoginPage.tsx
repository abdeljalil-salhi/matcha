import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../api";
import { GoogleSignInButton } from "../../components/auth/GoogleSignInButton";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { googleErrorMessage, safeNext } from "../../utils/googleAuth";
import { validateEmail } from "../../utils/validation";

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export function LoginPage() {
  const { setUser } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const from =
    (location.state as { from?: string } | null)?.from ??
    safeNext(params.get("next")) ??
    "/discover";
  const googleError = googleErrorMessage(params.get("google"));

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resent, setResent] = useState(false);
  const [dissolving, setDissolving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setBusy(true);
    try {
      await api.auth.login(username.trim(), password);
      const me = await api.profile.me();
      setDissolving(true);
      await wait(560);
      setUser(me);
      notify(`Welcome back${me?.first_name ? `, ${me.first_name}` : ""}.`, "success");
      navigate(me && !me.complete ? "/onboarding" : from, { replace: true });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Unable to sign in.";
      setError(message);
      if (cause instanceof ApiError && cause.status === 403) setUnverified(true);
    } finally {
      setBusy(false);
    }
  };

  const resend = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = validateEmail(resendEmail);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.auth.resendVerification(resendEmail.trim());
      setResent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to resend the email.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Good to see you again."
      subtitle="Sign in to pick up where you left off."
      dissolving={dissolving}
      pillLabel="Sign in"
      footer={
        <>
          <p>
            New to Matcha? <Link to="/register">Create an account</Link>
          </p>
          <p>
            <Link to="/forgot-password">Forgot your password?</Link>
          </p>
        </>
      }
    >
      {resent ? (
        <div className="notice notice--success">
          <strong>Check your inbox.</strong> We sent a fresh verification link if that address has an
          unverified account.
        </div>
      ) : null}

      {unverified ? (
        <div className="notice notice--info">
          <strong>Your email isn't verified yet.</strong>
          <p className="text-small">Enter the email you registered with and we'll send a new link.</p>
          <form className="inline-form" onSubmit={(event) => void resend(event)}>
            <input
              type="email"
              className="input"
              placeholder="you@example.com"
              value={resendEmail}
              onChange={(event) => setResendEmail(event.target.value)}
              aria-label="Registration email"
            />
            <Button type="submit" size="sm" loading={busy}>Resend</Button>
          </form>
        </div>
      ) : null}

      {googleError ? <div className="error-banner" role="alert">{googleError}</div> : null}

      {error && !unverified ? <div className="error-banner" role="alert">{error}</div> : null}

      <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
        <Field label="Username" htmlFor="login-username" required>
          <input
            id="login-username"
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="your_username"
          />
        </Field>

        <Field label="Password" htmlFor="login-password" required>
          <div className="input-with-action">
            <input
              id="login-password"
              className="input"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
            />
            <button
              type="button"
              className="input-with-action__button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </Field>

        <Button type="submit" size="lg" full loading={busy}>
          Sign in
        </Button>
      </form>

      <GoogleSignInButton next={from} />
    </AuthLayout>
  );
}
