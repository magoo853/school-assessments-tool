/**
 * Corrective-action bulk assign — set the CA owner and/or due date for
 * many findings at once (the /findings "visible set" workflow).
 *
 * Rules (kept deliberately conservative — this writes to many records):
 * - Only ACTIONABLE findings are ever touched: caStatus open or
 *   in_progress (absent caStatus = open, per lib/ca). Corrected and
 *   verified findings are finished work — bulk assign never reopens,
 *   reassigns, or re-dates them, and never clears their verified stamp.
 * - A patch field that is absent/blank leaves that field unchanged on
 *   every finding: bulk assign sets values, it never bulk-clears them.
 *   (Clearing stays a per-finding action on the row's own controls.)
 * - Pure functions only: the page decides which findings are "visible"
 *   (its current filtered set) and persists the returned rows.
 */

import type { Finding } from "./store";
import { caStatusOf } from "./ca";

export interface BulkCaPatch {
  /** Owner name to assign (trimmed; blank = leave owners unchanged). */
  owner?: string;
  /** Due date, YYYY-MM-DD (blank/invalid = leave due dates unchanged). */
  dueDate?: string;
}

export interface BulkCaPlan {
  /** New finding rows to persist (inputs are never mutated). */
  updated: Finding[];
  /** Visible findings skipped because they are corrected/verified. */
  skippedFinished: number;
  /** The normalized patch actually applied (null = nothing to apply). */
  patch: Required<BulkCaPatch> | null;
}

/** True when a finding can still receive a corrective-action assignment. */
export function isBulkAssignable(f: Finding): boolean {
  const s = caStatusOf(f);
  return s === "open" || s === "in_progress";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalize a raw patch: trims the owner, accepts only a real
 * YYYY-MM-DD due date, and returns null when nothing would change —
 * callers disable the apply button on a null patch.
 */
export function normalizeBulkPatch(
  patch: BulkCaPatch
): Required<BulkCaPatch> | null {
  const owner = (patch.owner ?? "").trim();
  const dueDate = (patch.dueDate ?? "").trim();
  const out: Required<BulkCaPatch> = {
    owner,
    dueDate: DATE_RE.test(dueDate) ? dueDate : "",
  };
  if (!out.owner && !out.dueDate) return null;
  return out;
}

/**
 * Plan a bulk assignment over a visible set of findings. Returns fresh
 * rows for the assignable findings with the patch applied (only the
 * fields the patch actually carries), plus how many visible findings
 * were skipped as already finished.
 */
export function planBulkAssign(
  visible: Finding[],
  rawPatch: BulkCaPatch
): BulkCaPlan {
  const patch = normalizeBulkPatch(rawPatch);
  const skippedFinished = visible.filter((f) => !isBulkAssignable(f)).length;
  if (!patch) return { updated: [], skippedFinished, patch: null };
  const updated = visible.filter(isBulkAssignable).map((f) => {
    const next: Finding = { ...f };
    if (patch.owner) next.caOwner = patch.owner;
    if (patch.dueDate) next.caDueDate = patch.dueDate;
    return next;
  });
  return { updated, skippedFinished, patch };
}
