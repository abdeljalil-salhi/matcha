import type { Gender } from "../api";

export const GENDERS: { value: Gender; label: string }[] = [
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
  { value: "nonbinary", label: "Non-binary" },
  { value: "other", label: "Other" },
];

const WEAK_PATTERNS = /password|qwerty|azerty|123456|motdepasse|contraseña|passwort/i;
const COMMON_WORDS = new Set([
  "letmein", "welcome", "iloveyou", "admin", "monkey", "dragon", "sunshine", "princess",
  "football", "baseball", "trustno1", "master", "hello", "freedom", "whatever", "qwertyuiop",
  "azertyuiop", "soleil", "chocolate", "password1", "passw0rd", "p@ssw0rd", "123456789",
]);

export function validateUsername(value: string): string | null {
  const username = value.trim();
  if (username.length < 3 || username.length > 32) return "Use between 3 and 32 characters.";
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return "Use letters, numbers, and underscores only.";
  return null;
}

export function validateEmail(value: string): string | null {
  const email = value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return "Enter a valid email address.";
  if (email.length > 254) return "That email address is too long.";
  return null;
}

export function validateName(value: string, label: string): string | null {
  const name = value.trim();
  if (!name) return `${label} is required.`;
  if (name.length > 80) return `${label} must be 80 characters or fewer.`;
  return null;
}

export function validatePassword(
  password: string,
  identifiers: { username?: string; first_name?: string; last_name?: string; email?: string } = {},
): string | null {
  if (password.length < 12 || password.length > 128) return "Use between 12 and 128 characters.";
  const normalized = password.normalize("NFKC").toLocaleLowerCase();
  if (new Set(normalized).size < 5) return "Use at least five different characters.";
  if (WEAK_PATTERNS.test(normalized)) return "That pattern is too predictable. Try something else.";
  const reduced = [...normalized].filter((character) => /\p{L}/u.test(character)).join("");
  const related = [
    identifiers.username,
    identifiers.first_name,
    identifiers.last_name,
    identifiers.email?.split("@")[0],
  ]
    .filter((part): part is string => Boolean(part && part.length >= 3))
    .map((part) => part.normalize("NFKC").toLocaleLowerCase());
  if (COMMON_WORDS.has(reduced) || related.some((part) => part === reduced)) {
    return "Choose a less common password.";
  }
  return null;
}

export function normalizeTag(tag: string): string {
  return tag.trim().normalize("NFKC").replace(/^#+/, "").toLocaleLowerCase();
}

export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  for (const piece of input.split(/[\s,]+/)) {
    const tag = normalizeTag(piece);
    if (/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(tag)) seen.add(tag);
  }
  return [...seen].slice(0, 15);
}

interface DateParts {
  year: number;
  month: number;
  day: number;
}

function parseDateParts(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function localDateString(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function validateBirthDate(value: string): string | null {
  if (!value) return "Choose your date of birth.";
  const parts = parseDateParts(value);
  if (!parts) return "Enter a valid date.";

  const now = new Date();
  let age = now.getFullYear() - parts.year;
  if (
    now.getMonth() + 1 < parts.month ||
    (now.getMonth() + 1 === parts.month && now.getDate() < parts.day)
  ) {
    age -= 1;
  }
  if (age < 18) return "You must be at least 18 years old.";
  if (age > 120) return "Check the year you entered.";
  return null;
}

export function maxBirthDate(): string {
  const now = new Date();
  const year = now.getFullYear() - 18;
  const month = now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  return localDateString(year, month, Math.min(now.getDate(), lastDay));
}
