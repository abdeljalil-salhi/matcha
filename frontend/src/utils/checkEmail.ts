export interface CheckEmailDetails {
  email: string;
  purpose: "verify" | "reset";
}

const STORAGE_KEY = "matcha:check-email";

export function rememberCheckEmail(details: CheckEmailDetails): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(details));
  } catch {
    // Private browsing can disable storage; navigation state still works.
  }
}

export function readCheckEmail(): CheckEmailDetails | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CheckEmailDetails>;
    if (
      typeof parsed.email === "string" &&
      (parsed.purpose === "verify" || parsed.purpose === "reset")
    ) {
      return { email: parsed.email, purpose: parsed.purpose };
    }
  } catch {
    // Ignore malformed or unavailable storage.
  }
  return null;
}
