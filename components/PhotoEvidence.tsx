/**
 * Report photo-evidence rendering (James-approved standard, 2026-10-14):
 * a finding's photos sit AT the finding (best 1–2 at readable size,
 * the rest as thumbnails), post-assessment photos are badged and pair
 * as before/after against during-assessment ones, and a closing Photo
 * Log lists every photo on the assessment. Logic lives in
 * lib/photoEvidence.ts; the shared-HTML builder renders the same
 * structure as strings.
 */
"use client";

import type { Assessment, Finding } from "@/lib/store";
import { photosFor, type PhotoDoc } from "@/lib/photos";
import {
  splitByTiming,
  postBadgeLabel,
  fmtPhotoStamp,
  type PhotoLogEntry,
} from "@/lib/photoEvidence";
import { RiskBadge } from "@/components/ui";

/** The visible badge every post-assessment photo carries. */
export function PostBadge({ photo }: { photo: PhotoDoc }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-300">
      📷 {postBadgeLabel(photo)}
    </span>
  );
}

function Figure({
  photo,
  alt,
  large,
  post,
}: {
  photo: PhotoDoc;
  alt: string;
  large?: boolean;
  post?: boolean;
}) {
  return (
    <figure className="relative overflow-hidden rounded-xl border border-slate-200">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.dataUrl}
        alt={alt}
        className={
          large
            ? "h-52 w-full object-cover"
            : "h-24 w-full object-cover"
        }
      />
      {post && (
        <span className="absolute left-1.5 top-1.5">
          <PostBadge photo={photo} />
        </span>
      )}
      {photo.caption?.trim() && (
        <figcaption className="bg-white px-2 py-1 text-[11px] text-slate-500">
          {photo.caption.trim()}
        </figcaption>
      )}
    </figure>
  );
}

function EraGroup({
  label,
  photos,
  alt,
  post,
}: {
  label: string;
  photos: PhotoDoc[];
  alt: string;
  post?: boolean;
}) {
  if (!photos.length) return null;
  const [lead, ...rest] = photos;
  return (
    <div>
      <p
        className={`mb-1.5 text-[11px] font-bold uppercase tracking-wide ${
          post ? "text-amber-700" : "text-slate-500"
        }`}
      >
        {label}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Figure photo={lead} alt={alt} large post={post} />
        {rest.slice(0, 1).map((p) => (
          <Figure key={p.id} photo={p} alt={alt} large post={post} />
        ))}
      </div>
      {rest.length > 1 && (
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {rest.slice(1).map((p) => (
            <Figure key={p.id} photo={p} alt={alt} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One finding's photos, presented at the finding: a labeled
 * before/after pair when both eras exist, otherwise the era group on
 * its own (during-assessment photos lead at readable size; extras
 * drop to thumbnails; post-assessment photos are badged).
 */
export function FindingPhotos({
  assessment,
  finding,
  photos,
}: {
  assessment: Assessment;
  finding: Finding;
  photos: PhotoDoc[];
}) {
  if (!photos.length) return null;
  const { during, post } = splitByTiming(assessment, photos);
  if (during.length && post.length) {
    return (
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        <EraGroup
          label="Before · during assessment"
          photos={during}
          alt={finding.gapText}
        />
        <EraGroup
          label="After · post-assessment"
          photos={post}
          alt={finding.gapText}
          post
        />
      </div>
    );
  }
  if (post.length) {
    return (
      <div className="mt-2">
        <EraGroup
          label="Post-assessment evidence"
          photos={post}
          alt={finding.gapText}
          post
        />
      </div>
    );
  }
  return (
    <div className="mt-2">
      <EraGroup
        label="Photo evidence"
        photos={during}
        alt={finding.gapText}
      />
    </div>
  );
}

/** The per-finding evidence block: gap → photos → recommendation. */
export function FindingEvidenceBlock({
  assessment,
  finding,
  index,
}: {
  assessment: Assessment;
  finding: Finding;
  index: number;
}) {
  const photos = photosFor(finding.photoIds);
  if (!photos.length) return null;
  return (
    <div className="break-inside-avoid">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">
          {index + 1}. {finding.gapText}
        </p>
        <RiskBadge risk={finding.risk} />
      </div>
      <FindingPhotos
        assessment={assessment}
        finding={finding}
        photos={photos}
      />
      {finding.recommendation?.trim() && (
        <p className="mt-2 text-sm text-slate-600">
          <span className="font-medium text-slate-800">Recommendation:</span>{" "}
          {finding.recommendation.trim()}
        </p>
      )}
    </div>
  );
}

/** The closing Photo Log — every photo on the assessment, in order. */
export function PhotoLog({ entries }: { entries: PhotoLogEntry[] }) {
  if (!entries.length) return null;
  return (
    <ol className="divide-y divide-slate-100">
      {entries.map((e, i) => (
        <li key={e.photo.id} className="flex gap-3 py-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={e.photo.dataUrl}
            alt={e.findingGap ?? e.location}
            className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-800">
              Photo {i + 1} · {fmtPhotoStamp(e.photo.createdAt)}
              {e.post && (
                <span className="ml-2 align-middle">
                  <PostBadge photo={e.photo} />
                </span>
              )}
            </p>
            <p className="truncate text-xs text-slate-500">
              {e.location}
              {e.criterion ? ` — “${e.criterion}”` : ""}
            </p>
            <p className="text-xs text-slate-500">
              {e.findingIndex
                ? `Finding ${e.findingIndex}: ${e.findingGap ?? ""}`
                : "Not tied to a finding"}
              {e.photo.caption?.trim()
                ? ` · Caption: ${e.photo.caption.trim()}`
                : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
