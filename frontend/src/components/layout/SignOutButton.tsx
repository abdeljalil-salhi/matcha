import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { Icon } from "../ui/Icon";

interface SignOutButtonProps {
  className?: string;
  showLabel?: boolean;
}

/** End the server session with one click and show a recoverable failure. */
export function SignOutButton({ className = "icon-button", showLabel = false }: SignOutButtonProps) {
  const { signOut } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    try {
      await signOut();
      notify("You've been signed out.", "info");
      navigate("/login", { replace: true });
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Unable to sign out. Try again.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={className}
      onClick={() => void logout()}
      disabled={busy}
      aria-busy={busy || undefined}
      aria-label="Sign out"
      title="Sign out"
    >
      <Icon name="logout" size={19} />
      {showLabel ? <span>Sign out</span> : null}
    </button>
  );
}
