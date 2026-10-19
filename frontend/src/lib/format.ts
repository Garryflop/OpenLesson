import type { LessonStatus, Role } from "../api/types";
import { msgs } from "../i18n";
import { plural as pluralRu } from "../i18n/plural";

const T = () => msgs().common;

/** Parses "YYYY-MM-DD" or naive ISO datetimes as local time (server stores university local time). */
export function parseDate(value: string): Date {
  const [d, t = "00:00:00"] = value.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm, ss] = t.split(":").map((x) => parseInt(x, 10) || 0);
  return new Date(y, m - 1, day, hh, mm, ss);
}

/** Local wall-clock ISO string without timezone (matches the backend format). */
export function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function fmtDate(value: string | null | undefined, withYear = false): string {
  if (!value) return "—";
  const d = parseDate(value);
  return `${d.getDate()} ${T().time.monthsGen[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ""}`;
}

export function fmtDateShort(value: string | null | undefined): string {
  if (!value) return "—";
  const d = parseDate(value);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export function fmtDateTime(value: string | null | undefined, withYear = false): string {
  if (!value) return "—";
  const d = parseDate(value);
  return `${fmtDate(value, withYear)}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function weekday(value: string): string {
  return T().time.weekdays[parseDate(value).getDay()];
}

export function monthTitle(value: string): string {
  const d = parseDate(value);
  return `${T().time.months[d.getMonth()]} ${d.getFullYear()}`;
}

/** Russian plural form (kept for callers that build Russian-only text). */
export const plural = pluralRu;

/** «через 3 дня» / "in 3 days", «2 часа назад» / "2 hours ago" relative to the platform clock. */
export function relative(value: string | null | undefined, now: Date): string {
  if (!value) return "—";
  const t = T().time;
  const diff = parseDate(value).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  if (minutes < 1) return t.now;
  if (diff > 0) return minutes < 60 ? t.inMinutes(minutes) : hours < 36 ? t.inHours(hours) : t.inDays(days);
  return minutes < 60 ? t.minutesAgo(minutes) : hours < 36 ? t.hoursAgo(hours) : t.daysAgo(days);
}

export function fileSize(bytes: number): string {
  const u = T().size;
  if (bytes < 1024) return `${bytes} ${u.b}`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ${u.kb}`;
  return `${(bytes / 1024 / 1024).toFixed(1)} ${u.mb}`;
}

export function score(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : v.toFixed(2).replace(/\.?0+$/, "");
}

export function roleLabels(): Record<Role, string> {
  return T().roles;
}

export type Tone = "gray" | "green" | "amber" | "red" | "blue" | "violet" | "sky" | "slate";

const STATUS_TONES: Record<LessonStatus, Tone> = {
  draft: "slate",
  scheduled: "gray",
  materials_ready: "green",
  confirmed: "blue",
  violation: "amber",
  annulled: "red",
  completed: "violet",
  feedback: "sky",
  closed: "slate",
};

/** Label, colour and hint of every lesson status in the current language. */
export function statusMeta(): Record<LessonStatus, { label: string; tone: Tone; hint: string }> {
  const labels = T().status;
  return Object.fromEntries(
    (Object.keys(STATUS_TONES) as LessonStatus[]).map((k) => [k, { ...labels[k], tone: STATUS_TONES[k] }]),
  ) as Record<LessonStatus, { label: string; tone: Tone; hint: string }>;
}

export function kindLabels(): Record<string, string> {
  return T().roomKinds;
}
