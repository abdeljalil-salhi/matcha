import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { rememberCheckEmail } from "../../utils/checkEmail";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { validateEmail } from "../../utils/validation";

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = validateEmail(email);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const normalized = email.trim();
      await api.auth.forgotPassword(normalized);
      rememberCheckEmail({ email: normalized, purpose: "reset" });
      navigate("/check-email", { state: { email: normalized, purpose: "reset" } });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to request a reset link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="Forgot your password?"
      subtitle="No problem. Enter your email and we'll send you a link to choose a new one."
      footer={
        <p>
          Remembered it? <Link to="/login">Back to sign in</Link>
        </p>
      }
    >
      {error ? <div className="error-banner" role="alert">{error}</div> : null}
      <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
        <Field label="Email" htmlFor="forgot-email" required>
          <input
            id="forgot-email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
            placeholder="you@example.com"
          />
        </Field>
        <Button type="submit" size="lg" full loading={busy}>Send reset link</Button>
      </form>
    </AuthLayout>
  );
}
