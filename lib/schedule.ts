/**
 * Schedule helpers — pure functions, no React.
 *
 * Reassessment clock: every completed assessment starts a 12-month
 * reassessment timer for that client.
 */
import { db } from "./store";

export type ReassessmentState = "overdue" | "due-soon" | "ok" | "none";

export interface ReassessmentInfo {
  /** YYYY-MM-DD of the latest completed assessment, or null. */
  lastDate: string | null;
  /** YYYY-MM-DD, lastDate + 12 months, or null. */
  dueDate: string | null;
  state: ReassessmentState;
}

/** Days until the due date counts as "due soon". */
export const REASSESSMENT_DUE_SOON_DAYS = 90;

function toISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Latest completed assessment date (YYYY-MM-DD) for a client, or null. */
export function getLastCompletedDate(clientName: string): string | null {
  const name = clientName.trim().toLowerCase();
  const done = db.assessments
    .filter(
      (a) =>
        a.status === "completed" &&
        !!(a.completedAt || a.createdAt) &&
        a.clientName.trim().toLowerCase() === name,
    )
    .sort((a, b) =>
      (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt),
    );
  const latest = done[0];
  if (!latest) return null;
  return (latest.completedAt ?? latest.createdAt).slice(0, 10);
}

/**
 * 12-month reassessment status for a client:
 * - none: no completed assessment on record
 * - overdue: due date is before today
 * - due-soon: due within 90 days (including today)
 * - ok: more than 90 days out
 */
export function getReassessment(clientName: string): ReassessmentInfo {
  const lastDate = getLastCompletedDate(clientName);
  if (!lastDate) return { lastDate: null, dueDate: null, state: "none" };

  const due = parseLocalDate(lastDate);
  due.setMonth(due.getMonth() + 12);
  const dueDate = toISODateLocal(due);

  const today = toISODateLocal(new Date());
  let state: ReassessmentState;
  if (dueDate < today) {
    state = "overdue";
  } else {
    const msLeft = parseLocalDate(dueDate).getTime() - parseLocalDate(today).getTime();
    state = msLeft <= REASSESSMENT_DUE_SOON_DAYS * 86_400_000 ? "due-soon" : "ok";
  }
  return { lastDate, dueDate, state };
}
