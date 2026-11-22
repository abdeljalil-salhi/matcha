import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../../api";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { Icon } from "../../components/ui/Icon";
import { readCheckEmail } from "../../utils/checkEmail";
import { validateEmail } from "../../utils/validation";

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

interface CheckEmailState {
  email?: string;
  purpose?: "verify" | "reset";
}

export function CheckEmailPage() {
  const location = useLocation();
  const state = { ...(readCheckEmail() ?? {}), ...((location.state ?? {}) as CheckEmailState) };
  const [email, setEmail] = useState(state.email ?? "");
  const isReset = (state.purpose ?? "verify") === "reset";
  const [busy, setBusy] = useState(false);
  const [dissolving, setDissolving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const resend = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = validateEmail(email);
    if (invalid) {
      setMessage(invalid);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (isReset) {
        await api.auth.forgotPassword(email.trim());
      } else {
        await api.auth.resendVerification(email.trim());
      }
      setDissolving(true);
      await wait(560);
      setMessage(isReset ? "A fresh reset link is on its way. Check your inbox." : "A fresh link is on its way. Check your inbox.");
      setDissolving(false);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to resend the email.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow={isReset ? "Password recovery" : "One more step"}
      title={isReset ? "Check your inbox." : "Verify your email."}
      subtitle={
        isReset
          ? `If an account exists for ${email || "that address"}, we've sent a reset link.`
          : `We sent a verification link to ${email || "your email address"}. Open it to activate your account.`
      }
      dissolving={dissolving}
      pillLabel={isReset ? "Reset link" : "Verify email"}
      footer={
        <p>
          Wrong address? <Link to={isReset ? "/forgot-password" : "/register"}>Go back</Link>
        </p>
      }
    >
      <div className="mail-illustration" aria-hidden="true">
        <Icon name="mail" size={30} />
      </div>

      {message ? <div className="notice notice--info" role="status">{message}</div> : null}

      {!email ? (
        <Field label="Email address" htmlFor="check-email" hint="Enter it again to resend the link.">
          <input
            id="check-email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </Field>
      ) : null}

      <form className="inline-form inline-form--center" onSubmit={(event) => void resend(event)}>
        <Button type="submit" variant="secondary" loading={busy}>
          {isReset ? "Resend reset link" : "Resend verification email"}
        </Button>
      </form>

      <p className="text-center text-small">
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthLayout>
  );
}
