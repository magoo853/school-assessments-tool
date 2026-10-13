/**
 * Delete a single generated report.
 *
 * Generated reports (ReportDoc rows — per-assessment AAR / findings /
 * recommendations, and combined "group:" roll-ups) previously had no
 * delete path anywhere in the app: regenerating overwrites the same
 * assessment+kind slot, but a report could never be removed, and
 * combined reports for different school selections accumulated
 * forever. (The report page's own "This report may have been deleted"
 * empty state was unreachable by any user action short of deleting
 * the whole assessment.)
 *
 * Deleting a report removes ONLY that generated-text snapshot. The
 * source assessment, its responses, findings, and equipment are
 * untouched, and the report can be regenerated from /reports at any
 * time. Nothing else references a report id, so there is no cascade.
 */
"use client";

import { db } from "./store";

/** Remove the report with this id. Returns true if a row was removed. */
export function deleteReport(reportId: string): boolean {
  if (!db.reports.get(reportId)) return false;
  db.reports.remove(reportId);
  return true;
}
