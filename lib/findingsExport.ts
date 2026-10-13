/**
 * Findings register export — pure functions, no React.
 *
 * The /findings view is a cross-assessment register (every finding,
 * filterable by risk / client / domain / corrective-action status /
 * text). Its exports must therefore describe the *filtered* rows the
 * assessor is looking at, not a single assessment:
 *  - CSV: one row per filtered finding, with the resolved client,
 *    assessment date, and domain the register displays, plus the
 *    corrective-action fields (status / owner / due date / overdue /
 *    verification) that the per-assessment findings CSV in
 *    lib/reports.ts does not carry. Column escaping matches
 *    lib/reports.ts toCsv exactly (quote on comma / quote / newline,
 *    quotes doubled, CRLF line endings).
 *  - Print: the page prints itself (window.print, like /summary);
 *    exportCounts() supplies the print-only register header counts so
 *    the printed page states what it contains.
 *
 * Gap statements export as recorded — negative gap wording, never
 * criterion text (same hard rule as lib/reports.ts).
 */

import type { CaStatus, Finding } from "./store";
import { caStatusOf, isCaOverdue, todayStr } from "./ca";

/** A register row: a finding plus the fields /findings resolves for it. */
export interface FindingExportRow {
  finding: Finding;
  clientName: string;
  /** Assessment date (YYYY-MM-DD) or "" when unknown. */
  date: string;
  domainName: string;
  templateName: string;
}

export const CA_EXPORT_LABELS: Record<CaStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  corrected: "Corrected",
  verified: "Verified",
};

function csvCell(v: string | null | undefined): string {
  const s = v ?? "";
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const FINDINGS_CSV_HEADER = [
  "client",
  "assessment_date",
  "domain",
  "template",
  "checkpoint_key",
  "risk",
  "gap_statement",
  "assessor_note",
  "recommendation",
  "ca_status",
  "ca_owner",
  "ca_due_date",
  "overdue",
  "ca_verified_at",
  "ca_verified_by",
] as const;

/**
 * CSV for the given register rows, in the order given (the register is
 * already sorted risk-then-date, and exports preserve the on-screen
 * order so a filtered printout and its CSV line up row for row).
 */
export function buildFindingsCsv(
  rows: FindingExportRow[],
  today: string = todayStr()
): string {
  const lines: string[][] = [[...FINDINGS_CSV_HEADER]];
  for (const r of rows) {
    const f = r.finding;
    lines.push([
      r.clientName,
      r.date,
      r.domainName,
      r.templateName,
      f.checkpointKey,
      f.risk,
      f.gapText,
      f.note,
      f.recommendation,
      CA_EXPORT_LABELS[caStatusOf(f)],
      f.caOwner ?? "",
      f.caDueDate ?? "",
      isCaOverdue(f, today) ? "yes" : "no",
      f.caVerifiedAt ?? "",
      f.caVerifiedBy ?? "",
    ]);
  }
  return lines.map((l) => l.map(csvCell).join(",")).join("\r\n");
}

/** findings-<client-slug>-<date>.csv, or findings-all-<date>.csv. */
export function findingsCsvFilename(
  clientName: string | null | undefined,
  dateStr: string
): string {
  const slug = (clientName ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `findings-${slug || "all"}-${dateStr}.csv`;
}

export interface FindingsExportCounts {
  total: number;
  high: number;
  moderate: number;
  low: number;
  /** Still actionable: open + in progress. */
  open: number;
  overdue: number;
}

/** Counts for the print register header, over the exported rows only. */
export function exportCounts(
  rows: FindingExportRow[],
  today: string = todayStr()
): FindingsExportCounts {
  const c: FindingsExportCounts = {
    total: rows.length,
    high: 0,
    moderate: 0,
    low: 0,
    open: 0,
    overdue: 0,
  };
  for (const r of rows) {
    if (r.finding.risk === "high") c.high += 1;
    else if (r.finding.risk === "moderate") c.moderate += 1;
    else c.low += 1;
    const s = caStatusOf(r.finding);
    if (s === "open" || s === "in_progress") c.open += 1;
    if (isCaOverdue(r.finding, today)) c.overdue += 1;
  }
  return c;
}

/** One-line corrective-action summary for the printed register row. */
export function caPrintLine(f: Finding, today: string = todayStr()): string {
  const parts = [`Action: ${CA_EXPORT_LABELS[caStatusOf(f)]}`];
  if (f.caOwner) parts.push(`Owner: ${f.caOwner}`);
  if (f.caDueDate) parts.push(`Due: ${f.caDueDate}`);
  if (isCaOverdue(f, today)) parts.push("⚠ Overdue");
  if (caStatusOf(f) === "verified" && f.caVerifiedAt) {
    parts.push(
      `Verified ${f.caVerifiedAt.slice(0, 10)}${f.caVerifiedBy ? ` by ${f.caVerifiedBy}` : ""}`
    );
  }
  return parts.join(" · ");
}
