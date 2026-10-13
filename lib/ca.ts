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
