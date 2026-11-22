export function fullName(person: { first_name?: string; last_name?: string; username?: string }): string {
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ").trim();
  return name || person.username || "Matcha member";
}

export function initials(person: { first_name?: string; last_name?: string; username?: string }): string {
  const first = person.first_name?.trim().charAt(0) ?? "";
  const last = person.last_name?.trim().charAt(0) ?? "";
  if (first || last) return `${first}${last}`.toUpperCase();
  return (person.username ?? "?").slice(0, 2).toUpperCase();
}

export function ageFromBirthDate(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const parts = birthDate.split("-").map(Number);
  if (parts.length !== 3) return null;
  const [year, month, day] = parts as [number, number, number];
  if (!year || !month || !day) return null;
  const today = new Date();
  let age = today.getFullYear() - year;
  const beforeBirthday =
    today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function clockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function dayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function distanceLabel(km: number | null): string {
  if (km === null || Number.isNaN(km)) return "Unknown distance";
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}

export function placeLabel(person: { city?: string | null; area?: string | null }): string {
  return [person.area, person.city].filter(Boolean).join(", ") || "Location private";
}

export function genderLabel(value: string | null | undefined): string {
  switch (value) {
    case "woman": return "Woman";
    case "man": return "Man";
    case "nonbinary": return "Non-binary";
    case "other": return "Other";
    default: return "Prefer not to say";
  }
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
