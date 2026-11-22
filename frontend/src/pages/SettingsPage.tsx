import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { useAuth } from "../context/AuthContext";
import { validateEmail } from "../utils/validation";

export function SettingsPage() {
  const { user, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [busyEmail, setBusyEmail] = useState(false);
  const [busyReset, setBusyReset] = useState(false);

  if (!user) return null;

  const changeEmail = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = validateEmail(email);
    if (invalid) {
      setEmailError(invalid);
      return;
    }
    if (!password) {
      setEmailError("Enter your current password.");
      return;
    }
    setBusyEmail(true);
    setEmailError(null);
    setEmailSuccess(null);
    try {
      await api.auth.changeEmail(email.trim(), password);
      setEmailSuccess("We sent a confirmation link to your new email address. Your email changes once you open it.");
      setEmail("");
      setPassword("");
      await refresh();
    } catch (cause) {
      setEmailError(cause instanceof Error ? cause.message : "Unable to change your email.");
    } finally {
      setBusyEmail(false);
    }
  };

  const requestReset = async () => {
    setBusyReset(true);
    setResetError(null);
    setResetSuccess(null);
    try {
      await api.auth.forgotPassword(user.email);
      setResetSuccess("A password reset link is on its way to your inbox.");
    } catch (cause) {
      setResetError(cause instanceof Error ? cause.message : "Unable to send a reset link.");
    } finally {
      setBusyReset(false);
    }
  };

  const logout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <div className="settings-page container">
      <header className="page-heading">
        <p className="eyebrow">Your account</p>
        <h1>Settings</h1>
        <p className="lead">Manage your login details and safety preferences.</p>
      </header>

      <div className="settings-grid">
        <section className="card settings-card">
          <h2>Email address</h2>
          <p className="text-muted text-small">Current email: <strong>{user.email}</strong></p>
          {user.is_demo ? (
            <p className="hint-box">Demo accounts can't change their email address.</p>
          ) : (
            <form className="stack" onSubmit={(event) => void changeEmail(event)} noValidate>
              {emailError ? <div className="error-banner" role="alert">{emailError}</div> : null}
              {emailSuccess ? <div className="notice notice--success" role="status">{emailSuccess}</div> : null}
              <Field label="New email" htmlFor="settings-email" required>
                <input
                  id="settings-email"
                  className="input"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setEmailError(null);
                  }}
                  placeholder="new@example.com"
                />
              </Field>
              <Field label="Current password" htmlFor="settings-password" required>
                <input
                  id="settings-password"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setEmailError(null);
                  }}
                />
              </Field>
              <Button type="submit" loading={busyEmail}>Update email</Button>
            </form>
          )}
        </section>

        <section className="card settings-card">
          <h2>Password</h2>
          {user.is_demo ? (
            <p className="hint-box">Demo accounts use a shared password, so recovery emails aren't sent.</p>
          ) : (
            <>
              <p className="text-muted text-small">We'll email you a link to choose a new password. All current sessions will end.</p>
              {resetError ? <div className="error-banner" role="alert">{resetError}</div> : null}
              {resetSuccess ? <div className="notice notice--success" role="status">{resetSuccess}</div> : null}
              <Button variant="secondary" loading={busyReset} onClick={() => void requestReset()}>
                Send password reset link
              </Button>
            </>
          )}
        </section>

        <section className="card settings-card">
          <h2>Safety</h2>
          <p className="text-muted text-small">Control who can see and contact you.</p>
          <Link to="/blocks" className="btn btn--secondary btn--md">Manage blocked accounts</Link>
        </section>

        <section className="card settings-card settings-card--danger">
          <h2>Sign out</h2>
          <p className="text-muted text-small">You can sign back in from any page.</p>
          <Button variant="danger" onClick={() => void logout()}>Sign out</Button>
        </section>
      </div>
    </div>
  );
}
