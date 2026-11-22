import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { Spinner } from "../../components/ui/Misc";
import { useAuth } from "../../context/AuthContext";
import { validatePassword } from "../../utils/validation";

type Mode = "verify" | "reset" | "email";

const COPY: Record<Mode, { eyebrow: string; title: string; subtitle: string }> = {
  verify: {
    eyebrow: "Email verification",
    title: "Confirming your email…",
    subtitle: "Just a moment while we activate your account.",
  },
  reset: {
    eyebrow: "Choose a new password",
    title: "Set a new password.",
    subtitle: "Pick something strong you haven't used on Matcha before.",
  },
  email: {
    eyebrow: "Email confirmation",
    title: "Updating your email…",
    subtitle: "Just a moment while we apply the change.",
  },
};

export function AccountLinkPage({ mode }: { mode: Mode }) {
  const { refresh, user } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const processed = useRef<{ mode: Mode; token: string | null } | null>(null);

  const submitLink = useCallback(
    async (linkToken: string) => {
      setStatus("working");
      try {
        const action = mode === "verify" ? api.auth.verify : api.auth.confirmEmail;
        await action(linkToken);
        if (mode === "email") await refresh();
        setStatus("done");
      } catch (cause) {
        setStatus("error");
        setError(cause instanceof Error ? cause.message : "This link could not be used.");
      }
    },
    [mode, refresh],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const linkToken = params.get("token");
    const previous = processed.current;
    // Email tokens are single-use; StrictMode re-runs effects and replaceState clears the hash.
    if (previous && previous.mode === mode && (previous.token === linkToken || linkToken === null)) {
      return;
    }
    processed.current = { mode, token: linkToken };
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    setToken(linkToken);
    setError(null);
    setPassword("");
    setConfirm("");
    setFieldError(null);
    if (!linkToken) {
      setStatus("error");
      setError("This link is incomplete. Open the full link from your email.");
      return;
    }
    if (mode === "reset") {
      setStatus("idle");
      return;
    }
    void submitLink(linkToken);
  }, [mode, submitLink]);

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    const invalid = validatePassword(password, {
      username: user?.username,
      first_name: user?.first_name,
      last_name: user?.last_name,
      email: user?.email,
    });
    if (invalid) {
      setFieldError(invalid);
      return;
    }
    if (password !== confirm) {
      setFieldError("Passwords don't match.");
      return;
    }
    setFieldError(null);
    setStatus("working");
    try {
      await api.auth.resetPassword(token, password);
      setStatus("done");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Unable to reset your password.");
    }
  };

  const copy = COPY[mode];
  const signedIn = Boolean(user);

  return (
    <AuthLayout
      eyebrow={copy.eyebrow}
      title={status === "done" ? "All set." : copy.title}
      subtitle={status === "done" ? "You can continue with your account now." : copy.subtitle}
      footer={
        <p>
          <Link to={signedIn ? "/discover" : "/login"}>
            {signedIn ? "Back to Matcha" : "Go to sign in"}
          </Link>
        </p>
      }
    >
      {status === "working" ? (
        <div className="link-status">
          <Spinner label="Working" />
          <span>{copy.subtitle}</span>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="notice notice--error" role="alert">
          <strong>We couldn't complete that.</strong>
          <p className="text-small">{error}</p>
          <p className="text-small text-muted">Links expire after a while — you can request a new one from your account settings.</p>
          {token && mode !== "reset" ? (
            <p className="text-small">
              <button type="button" className="link-button" onClick={() => void submitLink(token)}>
                Try this link again
              </button>
            </p>
          ) : null}
        </div>
      ) : null}

      {status === "done" ? (
        <div className="notice notice--success">
          <strong>Success.</strong>
          <p className="text-small">
            {mode === "verify"
              ? "Your email is verified. Sign in to complete your profile."
              : mode === "reset"
                ? "Your password has been changed. Sign in with your new password."
                : "Your new email address is confirmed."}
          </p>
        </div>
      ) : null}

      {mode === "reset" && status === "idle" ? (
        <form className="auth-form" onSubmit={(event) => void resetPassword(event)} noValidate>
          {fieldError ? <div className="error-banner" role="alert">{fieldError}</div> : null}
          <Field label="New password" htmlFor="reset-password" required>
            <input
              id="reset-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setFieldError(null);
              }}
            />
          </Field>
          <Field label="Confirm password" htmlFor="reset-confirm" required>
            <input
              id="reset-confirm"
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => {
                setConfirm(event.target.value);
                setFieldError(null);
              }}
            />
          </Field>
          <Button type="submit" size="lg" full>Change password</Button>
        </form>
      ) : null}
    </AuthLayout>
  );
}
