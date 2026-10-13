/**
 * Peer-review / approval workflow for completed assessments.
 *
 *   (completed) ──submit──▶ pending ──approve──▶ approved
 *                    ▲          │
 *                    │          └──send back (comment required)──▶ sent_back
 *                    └────────────── resubmit ◀──────────────────┘
 *   pending ──withdraw──▶ (no review record)
 *
 * While pending or approved the assessment is LOCKED: it cannot be
 * reopened for editing or deleted — the reviewer decides, or the
 * submitter withdraws. There are no accounts yet, so names are
 * recorded snapshots (an honest workflow record, not an enforced
 * permission); the gate becomes hard when Supabase Auth lands.
 */
"use client";

import { db, nowIso, type Assessment } from "./store";

export function isReviewLocked(a: Assessment): boolean {
  const s = a.review?.state;
  return s === "pending" || s === "approved";
}

export function submitForReview(
  assessmentId: string,
  opts: { byName: string; reviewerId?: string; reviewerName?: string }
): boolean {
  const a = db.assessments.get(assessmentId);
  if (!a || a.status !== "completed") return false;
  if (a.review && a.review.state !== "sent_back") return false;
  if (!opts.byName.trim()) return false;
  db.assessments.upsert({
    ...a,
    review: {
      state: "pending",
      submittedBy: opts.byName.trim(),
      submittedAt: nowIso(),
      reviewerId: opts.reviewerId || undefined,
      reviewerName: opts.reviewerName?.trim() || undefined,
    },
  });
  return true;
}

export function approveReview(
  assessmentId: string,
  opts: { byName: string; comment?: string }
): boolean {
  const a = db.assessments.get(assessmentId);
  if (!a || a.review?.state !== "pending") return false;
  if (!opts.byName.trim()) return false;
  db.assessments.upsert({
    ...a,
    review: {
      ...a.review,
      state: "approved",
      decidedBy: opts.byName.trim(),
      decidedAt: nowIso(),
      comment: opts.comment?.trim() || undefined,
    },
  });
  return true;
}

export function sendBack(
  assessmentId: string,
  opts: { byName: string; comment: string }
): boolean {
  const a = db.assessments.get(assessmentId);
  if (!a || a.review?.state !== "pending") return false;
  if (!opts.byName.trim() || !opts.comment.trim()) return false;
  db.assessments.upsert({
    ...a,
    review: {
      ...a.review,
      state: "sent_back",
      decidedBy: opts.byName.trim(),
      decidedAt: nowIso(),
      comment: opts.comment.trim(),
    },
  });
  return true;
}

export function withdrawReview(assessmentId: string): boolean {
  const a = db.assessments.get(assessmentId);
  if (!a || a.review?.state !== "pending") return false;
  db.assessments.upsert({ ...a, review: undefined });
  return true;
}

/** Assessments awaiting a review decision, oldest first. */
export function pendingReviews(): Assessment[] {
  return db.assessments
    .filter((a) => a.review?.state === "pending")
    .sort((x, y) =>
      (x.review?.submittedAt ?? "").localeCompare(y.review?.submittedAt ?? "")
    );
}
