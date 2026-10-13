/**
 * Calendar export for scheduled visits — pure functions, no React.
 *
 * A scheduled visit is an all-day event on its YYYY-MM-DD date (the
 * schedule stores no time of day). Both exports honour that:
 *  - .ics: DTSTART;VALUE=DATE with DTEND;VALUE=DATE the *next* day
 *    (RFC 5545 all-day events use an exclusive end date).
 *  - Google Calendar: the render/template URL with the same
 *    start/exclusive-end date pair.
 *
 * Text values are escaped per RFC 5545 §3.3.11 (backslash, semicolon,
 * comma, newlines) and lines are folded at 75 octets per §3.1 so
 * strict parsers (Outlook, Apple Calendar) accept long notes.
 */
import type { ScheduleItem } from "./store";

export interface CalendarEventDetails {
  /** Human-readable template name (the row already resolves this). */
  templateLabel?: string;
  /** Assigned assessor's display name, when one is assigned. */
  assessorName?: string;
}

/** YYYY-MM-DD -> YYYYMMDD ("" for a malformed date). */
export function icsDate(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.replace(/-/g, "") : "";
}

/** YYYY-MM-DD of the day after `iso` (local calendar math, DST-safe). */
export function nextDayIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

/** UTC DTSTAMP value (YYYYMMDDTHHMMSSZ) for a Date. */
export function icsTimestamp(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}` +
    `T${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}Z`
  );
}

/** RFC 5545 text escaping: backslash first, then ; , and newlines. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Fold a content line at 75 octets (RFC 5545 §3.1): continuation lines
 * start with a single space, which counts toward the 75. Folding is
 * done on UTF-8 bytes so multi-byte characters are never split.
 */
export function foldIcsLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never split a UTF-8 sequence: continuation bytes are 10xxxxxx.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    parts.push(decoder.decode(bytes.subarray(start, end)));
    start = end;
    limit = 74; // continuation lines spend 1 octet on the leading space
  }
  return parts.join("\r\n ");
}

function eventTitle(item: ScheduleItem): string {
  return `Assessment visit — ${item.clientName}`;
}

function eventLocation(item: ScheduleItem): string {
  return [item.campus, item.clientName].filter(Boolean).join(", ");
}

function eventDescription(item: ScheduleItem, details: CalendarEventDetails): string {
  const lines: string[] = [];
  if (details.templateLabel) lines.push(`Template: ${details.templateLabel}`);
  lines.push(`Assessor: ${details.assessorName ?? "Unassigned"}`);
  lines.push(`Status: ${item.status.replace("_", " ")}`);
  if (item.focusNotes) lines.push("", `Focus notes: ${item.focusNotes}`);
  return lines.join("\n");
}

/**
 * A complete single-event .ics file for a scheduled visit.
 * `now` is injectable so tests get a deterministic DTSTAMP.
 */
export function buildVisitIcs(
  item: ScheduleItem,
  details: CalendarEventDetails = {},
  now: Date = new Date(),
): string {
  const start = icsDate(item.date);
  const end = icsDate(nextDayIso(item.date));
  const status = item.status === "cancelled" ? "CANCELLED" : "CONFIRMED";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//School Assessments Tool//Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:schedule-${item.id}@school-assessments-tool`,
    `DTSTAMP:${icsTimestamp(now)}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeIcsText(eventTitle(item))}`,
    `DESCRIPTION:${escapeIcsText(eventDescription(item, details))}`,
    `LOCATION:${escapeIcsText(eventLocation(item))}`,
    `STATUS:${status}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

/** "Add to Google Calendar" template URL for the same all-day event. */
export function googleCalendarUrl(
  item: ScheduleItem,
  details: CalendarEventDetails = {},
): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: eventTitle(item),
    dates: `${icsDate(item.date)}/${icsDate(nextDayIso(item.date))}`,
    details: eventDescription(item, details),
    location: eventLocation(item),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Download filename, e.g. assessment-visit-riverbend-high-2026-11-04.ics */
export function icsFilename(item: ScheduleItem): string {
  const slug = item.clientName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `assessment-visit-${slug || "visit"}-${item.date}.ics`;
}
