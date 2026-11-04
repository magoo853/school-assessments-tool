/**
 * Corrective-action (CA) helpers — single source of truth for CA status,
 * overdue detection, and summary counts.
 *
 * Used by /findings (filters + badges), the Dashboard drill-down card, and
 * /summary so every surface counts the same way the findings filter does:
 * - status defaults to "open" when a finding has no caStatus yet;
 * - a finding is overdue only while it is still actionable (open or
 *   in_progress) and its due date is strictly before today — corrected and
 *   verified findings are never overdue, and a finding due today is not
 *   overdue yet.
 */

import type { CaStatus, Finding } from "./store";

export function caStatusOf(f: Finding): CaStatus {
  return f.caStatus ?? "open";
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isCaOverdue(f: Finding, today: string = todayStr()): boolean {
  const s = caStatusOf(f);
  if (!f.caDueDate || (s !== "open" && s !== "in_progress")) return false;
  return f.caDueDate < today;
}

export interface CaSummary {
  /** All findings tracked. */
  total: number;
  open: number;
  inProgress: number;
  corrected: number;
  verified: number;
  /** Actionable = open + in_progress (still awaiting correction). */
  actionable: number;
  /** Actionable findings past their due date. */
  overdue: number;
}

export function summarizeCa(
  findings: Finding[],
  today: string = todayStr()
): CaSummary {
  const summary: CaSummary = {
    total: findings.length,
    open: 0,
    inProgress: 0,
    corrected: 0,
    verified: 0,
    actionable: 0,
    overdue: 0,
  };
  for (const f of findings) {
    const s = caStatusOf(f);
    if (s === "open") summary.open += 1;
    else if (s === "in_progress") summary.inProgress += 1;
    else if (s === "corrected") summary.corrected += 1;
    else summary.verified += 1;
    if (isCaOverdue(f, today)) summary.overdue += 1;
  }
  summary.actionable = summary.open + summary.inProgress;
  return summary;
}

/**
 * Coded close-outs (2026-11-02): when a corrective action is marked
 * corrected/verified, the closer can record WHAT WAS WRONG and WHAT
 * WAS DONE from these code lists (stored on Finding.caIssueCode /
 * caRemedyCode). Codes are the aggregation layer — the free-text note
 * stays for the detail. Lists are deliberately short and physical:
 * this app's CAs are campus-safety items, not IT tickets.
 */
export const CA_ISSUE_CODES: Record<string, string> = {
  hardware_failed: "Hardware failed",
  hardware_damaged_worn: "Hardware damaged / worn out",
  hardware_missing: "Hardware missing / never installed",
  misadjusted: "Present but misadjusted / misaligned",
  propped_or_bypassed: "Defeated in use (propped, bypassed, disabled)",
  policy_gap: "Policy / procedure missing or out of date",
  staffing_gap: "Staffing / coverage gap",
  training_gap: "Training / awareness gap",
  other: "Other (see note)",
};

export const CA_REMEDY_CODES: Record<string, string> = {
  repaired: "Repaired in place",
  replaced: "Replaced with new hardware",
  installed_new: "Installed new (was missing)",
  adjusted: "Adjusted / realigned / reconfigured",
  policy_adopted: "Policy adopted / updated",
  staff_assigned: "Staff assigned / coverage changed",
  training_completed: "Training completed",
  removed_hazard: "Hazard removed",
  other: "Other (see note)",
};

export function caIssueLabel(code: string | undefined): string {
  return code ? (CA_ISSUE_CODES[code] ?? code) : "";
}

export function caRemedyLabel(code: string | undefined): string {
  return code ? (CA_REMEDY_CODES[code] ?? code) : "";
}

const RISK_ORDER: Record<string, number> = { high: 0, moderate: 1, low: 2 };

/**
 * Overdue findings, most overdue first (earliest due date first);
 * ties break by risk severity so the worst items surface first.
 */
export function overdueFindings(
  findings: Finding[],
  today: string = todayStr()
): Finding[] {
  return findings
    .filter((f) => isCaOverdue(f, today))
    .sort(
      (a, b) =>
        (a.caDueDate ?? "").localeCompare(b.caDueDate ?? "") ||
        (RISK_ORDER[a.risk] ?? 3) - (RISK_ORDER[b.risk] ?? 3)
    );
}

/* ------------------------------------------------------------------ */
/* Verified closure that can lapse and regress (2026-11-04, #4)        */
/* ------------------------------------------------------------------ */

/** Days after verification by which a verified closure must be
 *  re-verified, scaled by the finding's severity. */
export function reverifyWindowDays(risk: Finding["risk"]): number {
  return risk === "high" ? 90 : risk === "moderate" ? 180 : 365;
}

/** caReverifyBy for a verification happening on `verifiedAt` (ISO). */
export function reverifyByFor(risk: Finding["risk"], verifiedAt: string): string {
  const d = new Date(verifiedAt);
  d.setDate(d.getDate() + reverifyWindowDays(risk));
  return d.toISOString().slice(0, 10);
}

/** A verified closure whose re-verify-by date has passed. The closure
 *  still stands — but it is surfaced until re-verified. */
export function isReverifyLapsed(
  f: Finding,
  today: string = todayStr()
): boolean {
  if (caStatusOf(f) !== "verified" || !f.caReverifyBy) return false;
  return f.caReverifyBy < today;
}
