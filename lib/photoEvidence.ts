/**
 * Photo-evidence presentation logic (James-approved standard, 2026-10-14).
 *
 * The standard:
 *  1. A finding's photos render AT the finding in reports — finding →
 *     photo evidence → recommendation in one view.
 *  2. A closing Photo Log lists EVERY photo attached to the assessment
 *     (including photos on checkpoints that produced no finding) with
 *     location, timestamp, and finding reference — the completeness /
 *     chain-of-custody record.
 *  3. A photo added AFTER the assessment was completed is visibly
 *     badged "Post-assessment — <date>" wherever it appears, and a
 *     finding holding both eras presents them as a labeled
 *     before/after pair.
 *
 * Data model: NO schema change. The discriminator is derived —
 * PhotoDoc.createdAt (stamped at save) vs Assessment.completedAt
 * (stamped at completion). A photo saved after the completion stamp
 * was, by definition, added after the assessment closed. While an
 * assessment is still open nothing is "post". String comparison is
 * sound: both stamps are ISO-8601 UTC from nowIso().
 *
 * "Location" is the checkpoint the photo hangs on — number + domain
 * from the template index, with the criterion text alongside. PhotoDoc
 * carries no GPS (EXIF is stripped by the compression pipeline), so
 * the checkpoint is the honest location the app actually knows.
 */
import type { Assessment, Finding, ResponseRow } from "./store";
import type { PhotoDoc } from "./photos";

export interface CheckpointRefLike {
  num: string;
  text: string;
  domain: string;
}

/** True when the photo was saved after the assessment was completed. */
export function isPostAssessmentPhoto(
  a: Pick<Assessment, "completedAt">,
  p: Pick<PhotoDoc, "createdAt">
): boolean {
  return Boolean(a.completedAt) && p.createdAt > (a.completedAt as string);
}

/** Split one finding's photos into during-assessment and post eras. */
export function splitByTiming(
  a: Pick<Assessment, "completedAt">,
  photos: PhotoDoc[]
): { during: PhotoDoc[]; post: PhotoDoc[] } {
  const during: PhotoDoc[] = [];
  const post: PhotoDoc[] = [];
  for (const p of photos) {
    (isPostAssessmentPhoto(a, p) ? post : during).push(p);
  }
  return { during, post };
}

export interface PhotoLogEntry {
  photo: PhotoDoc;
  /** "3.2 — Perimeter" style label from the checkpoint index. */
  location: string;
  /** The checkpoint criterion the photo was captured against. */
  criterion?: string;
  /** 1-based finding number in report order, or null when the photo
   *  hangs on a checkpoint that produced no finding. */
  findingIndex: number | null;
  findingGap?: string;
  post: boolean;
}

/**
 * Build the closing Photo Log: every photo referenced by this
 * assessment's findings or walkthrough responses, deduped (a finding
 * association wins over the response it derived from), ordered
 * chronologically as a custody record.
 */
export function buildPhotoLog(args: {
  assessment: Assessment;
  /** Findings in report order — index+1 is the printed finding number. */
  findings: Finding[];
  responses: ResponseRow[];
  photosById: Map<string, PhotoDoc>;
  checkpointIdx: Map<string, CheckpointRefLike>;
}): PhotoLogEntry[] {
  const { assessment, findings, responses, photosById, checkpointIdx } =
    args;
  const seen = new Set<string>();
  const entries: PhotoLogEntry[] = [];

  const push = (
    photoId: string,
    checkpointKey: string,
    findingIndex: number | null,
    findingGap?: string
  ) => {
    if (seen.has(photoId)) return;
    const photo = photosById.get(photoId);
    if (!photo) return;
    seen.add(photoId);
    const cp = checkpointIdx.get(checkpointKey);
    entries.push({
      photo,
      location: cp ? `${cp.num} — ${cp.domain}` : checkpointKey,
      criterion: cp?.text,
      findingIndex,
      findingGap,
      post: isPostAssessmentPhoto(assessment, photo),
    });
  };

  findings.forEach((f, i) => {
    for (const id of f.photoIds ?? []) push(id, f.checkpointKey, i + 1, f.gapText);
  });
  for (const r of responses) {
    for (const id of r.photoIds ?? []) push(id, r.checkpointKey, null);
  }

  return entries.sort((x, y) =>
    x.photo.createdAt < y.photo.createdAt
      ? -1
      : x.photo.createdAt > y.photo.createdAt
        ? 1
        : 0
  );
}

/** "Oct 14, 2026" in the viewer's locale. */
export function fmtPhotoDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso.slice(0, 10)
    : d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

/** "Oct 14, 2026 · 9:41 AM" in the viewer's locale. */
export function fmtPhotoStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${fmtPhotoDate(iso)} · ${time}`;
}

/** The badge text carried by every post-assessment photo. */
export function postBadgeLabel(p: Pick<PhotoDoc, "createdAt">): string {
  return `Post-assessment — ${fmtPhotoDate(p.createdAt)}`;
}
