import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api";
import { rememberCheckEmail } from "../../utils/checkEmail";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import {
  validateEmail,
  validateName,
  validatePassword,
  validateUsername,
} from "../../utils/validation";

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

interface FormState {
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  password: string;
  confirm: string;
}

type FieldName = keyof FormState;

export function RegisterPage() {
  const navigate = useNavigate();
  const [values, setValues] = useState<FormState>({
    username: "",
    email: "",
    first_name: "",
    last_name: "",
    password: "",
    confirm: "",
  });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dissolving, setDissolving] = useState(false);

  const set = (field: FieldName, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<FieldName, string>> = {};
    next.username = validateUsername(values.username) ?? undefined;
    next.email = validateEmail(values.email) ?? undefined;
    next.first_name = validateName(values.first_name, "First name") ?? undefined;
    next.last_name = validateName(values.last_name, "Last name") ?? undefined;
    next.password =
      validatePassword(values.password, {
        username: values.username,
        first_name: values.first_name,
        last_name: values.last_name,
        email: values.email,
      }) ?? undefined;
    if (!values.confirm) next.confirm = "Confirm your password.";
    else if (values.confirm !== values.password) next.confirm = "Passwords don't match.";
    setErrors(next);
    return Object.values(next).every((value) => !value);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      await api.auth.register({
        username: values.username.trim(),
        email: values.email.trim(),
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        password: values.password,
      });
      const email = values.email.trim();
      rememberCheckEmail({ email, purpose: "verify" });
      setDissolving(true);
      await wait(560);
      navigate("/check-email", { state: { email, purpose: "verify" } });
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Unable to create the account.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Join Matcha"
      title="Let's start with the basics."
      subtitle="A few details, one email confirmation, and you're in."
      dissolving={dissolving}
      pillLabel="Create account"
      footer={
        <p>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      }
    >
      {formError ? <div className="error-banner" role="alert">{formError}</div> : null}

      <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
        <div className="form-grid">
          <Field label="First name" htmlFor="register-first" error={errors.first_name} required>
            <input
              id="register-first"
              className="input"
              autoComplete="given-name"
              value={values.first_name}
              onChange={(event) => set("first_name", event.target.value)}
            />
          </Field>
          <Field label="Last name" htmlFor="register-last" error={errors.last_name} required>
            <input
              id="register-last"
              className="input"
              autoComplete="family-name"
              value={values.last_name}
              onChange={(event) => set("last_name", event.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Username"
          htmlFor="register-username"
          error={errors.username}
          hint="Letters, numbers and underscores."
          required
        >
          <input
            id="register-username"
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={values.username}
            onChange={(event) => set("username", event.target.value)}
          />
        </Field>

        <Field label="Email" htmlFor="register-email" error={errors.email} required>
          <input
            id="register-email"
            className="input"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => set("email", event.target.value)}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="register-password"
          error={errors.password}
          hint="At least 12 characters, with a mix of characters. Avoid common words."
          required
        >
          <input
            id="register-password"
            className="input"
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={(event) => set("password", event.target.value)}
          />
        </Field>

        <Field label="Confirm password" htmlFor="register-confirm" error={errors.confirm} required>
          <input
            id="register-confirm"
            className="input"
            type="password"
            autoComplete="new-password"
            value={values.confirm}
            onChange={(event) => set("confirm", event.target.value)}
          />
        </Field>

        <Button type="submit" size="lg" full loading={busy}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
