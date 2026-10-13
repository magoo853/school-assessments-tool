/**
 * Reassessment support: start a new assessment pre-loaded with a
 * previous assessment's answers, so a revisit only confirms what
 * changed. Answers, risk ratings, and notes carry over; photos do NOT
 * (they are evidence of the earlier visit and stay attached to it),
 * and findings re-derive fresh — corrective actions start open.
 */
"use client";

import { db, newAssessment, uid, type Assessment } from "./store";
import { getCheckpoint } from "./templates";
import { resolveTemplate } from "./customTemplates";
import { deriveFindings } from "./findings";

/** Most recent completed assessment for a client, if any. */
export function latestCompletedFor(clientName: string): Assessment | undefined {
  return db.assessments
    .filter((a) => a.clientName === clientName && a.status === "completed")
    .sort((a, b) =>
      (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt)
    )[0];
}

/**
 * Copy a source assessment's answered responses onto a target
 * assessment. Only checkpoints that exist in the TARGET's template are
 * copied (matters when the revisit uses a different template). Returns
 * the number of responses copied.
 */
export function copyResponsesForward(
  source: Assessment,
  target: Assessment
): number {
  const template = resolveTemplate(target.templateId);
  let copied = 0;
  for (const r of db.responses.filter((x) => x.assessmentId === source.id)) {
    if (r.answer == null) continue;
    if (!getCheckpoint(template, r.checkpointKey)) continue;
    db.responses.upsert({
      id: uid("rsp"),
      assessmentId: target.id,
      checkpointKey: r.checkpointKey,
      answer: r.answer,
      risk: r.risk,
      note: r.note,
      photoRef: "",
      // photoIds deliberately not copied — see header note.
    });
    copied++;
  }
  return copied;
}

/**
 * Create a new in-progress reassessment of a completed assessment:
 * same client, campus, template, and team; answers pre-loaded;
 * findings re-derived. Returns the new assessment.
 */
export function startReassessment(source: Assessment): Assessment {
  const target = newAssessment({
    clientName: source.clientName,
    campus: source.campus,
    templateId: source.templateId,
    assessorIds: [...source.assessorIds],
    leadAssessorId: source.leadAssessorId,
    focusNotes: source.focusNotes,
    status: "in_progress",
    cover: {
      date: new Date().toISOString().slice(0, 10),
      assessors: source.cover?.assessors ?? "",
      escort: source.cover?.escort ?? "",
      weather: "",
    },
  });
  db.assessments.upsert(target);
  copyResponsesForward(source, target);
  deriveFindings(target.id);
  return target;
}
