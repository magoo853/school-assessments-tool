/**
 * Delete an assessment and everything derived from it.
 *
 * Removes the assessment row plus its responses, findings, reports,
 * equipment, and FSL record. Schedule entries that pointed at it are
 * unlinked (an in-progress visit returns to "scheduled"; its history
 * entry otherwise stays). Combined ("group:") reports are snapshots
 * of generated text and are left alone. Photos are NOT deleted —
 * photo docs are shared infrastructure and may be referenced from a
 * backup restore; orphaned photos can be cleaned from Integrations.
 */
"use client";

import { db } from "./store";

export interface DeleteCounts {
  responses: number;
  findings: number;
  reports: number;
  equipment: number;
  fslRecords: number;
  schedulesUnlinked: number;
}

export function countAssessmentData(assessmentId: string): DeleteCounts {
  return {
    responses: db.responses.filter((r) => r.assessmentId === assessmentId).length,
    findings: db.findings.filter((f) => f.assessmentId === assessmentId).length,
    reports: db.reports.filter(
      (r) => r.assessmentId === assessmentId
    ).length,
    equipment: db.equipment.filter((e) => e.assessmentId === assessmentId).length,
    fslRecords: db.fslRecords.filter((f) => f.assessmentId === assessmentId)
      .length,
    schedulesUnlinked: db.schedules.filter((s) => s.assessmentId === assessmentId)
      .length,
  };
}

export function deleteAssessmentCascade(assessmentId: string): DeleteCounts {
  const counts = countAssessmentData(assessmentId);

  db.responses
    .filter((r) => r.assessmentId === assessmentId)
    .forEach((r) => db.responses.remove(r.id));
  db.findings
    .filter((f) => f.assessmentId === assessmentId)
    .forEach((f) => db.findings.remove(f.id));
  db.reports
    .filter((r) => r.assessmentId === assessmentId)
    .forEach((r) => db.reports.remove(r.id));
  db.equipment
    .filter((e) => e.assessmentId === assessmentId)
    .forEach((e) => db.equipment.remove(e.id));
  db.fslRecords
    .filter((f) => f.assessmentId === assessmentId)
    .forEach((f) => db.fslRecords.remove(f.id));

  db.schedules
    .filter((s) => s.assessmentId === assessmentId)
    .forEach((s) =>
      db.schedules.upsert({
        ...s,
        assessmentId: undefined,
        status: s.status === "in_progress" ? "scheduled" : s.status,
      })
    );

  db.assessments.remove(assessmentId);
  return counts;
}
