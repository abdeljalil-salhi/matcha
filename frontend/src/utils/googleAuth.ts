const MESSAGES: Record<string, string> = {
  denied: "Google sign-in was cancelled. You can sign in another way.",
  invalid: "We couldn't complete Google sign-in. Please try again or use your password.",
  unavailable: "Google sign-in isn't available right now. Use your username and password.",
  pending: "Verify your email address first, then sign in with Google again.",
  conflict: "This Google account can't be linked to that Matcha account.",
  rate_limited: "Too many sign-in attempts. Please wait a moment and try again.",
};

export function googleErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return (
    MESSAGES[code] ??
    "We couldn't complete Google sign-in. Please try again or use your password."
  );
}

export function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }
  return value;
}
