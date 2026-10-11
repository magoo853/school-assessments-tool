/**
 * Shared assessor display: photo, name, title, and background-clearance
 * status — the details a school needs to verify who's coming to campus.
 * Used on the schedule board and assessment pages (not just the directory).
 */
"use client";

import type { Assessor } from "@/lib/store";
import { Badge } from "@/components/ui";

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function clearanceInfo(a: Assessor): {
  tone: "green" | "yellow" | "red";
  label: string;
} {
  const today = new Date().toISOString().slice(0, 10);
  if (a.clearanceExpiry && a.clearanceExpiry < today)
    return { tone: "red", label: "Clearance expired" };
  if (a.clearanceStatus === "expired")
    return { tone: "red", label: "Clearance expired" };
  if (a.clearanceStatus === "pending")
    return { tone: "yellow", label: "Clearance pending" };
  return { tone: "green", label: "Clearance current" };
}

function Photo({ a, size }: { a: Assessor; size: "sm" | "md" }) {
  const cls =
    size === "sm"
      ? "h-10 w-10 text-sm"
      : "h-14 w-14 text-lg";
  if (a.photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={a.photo}
        alt={a.name}
        className={`${cls} shrink-0 rounded-xl border border-gray-200 object-cover`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`${cls} flex shrink-0 items-center justify-center rounded-xl bg-violet-100 font-bold text-violet-800`}
    >
      {initials(a.name)}
    </div>
  );
}

/**
 * Compact row: photo + name + clearance badge. For schedule items.
 */
export function AssessorCompact({ assessor }: { assessor: Assessor }) {
  const badge = clearanceInfo(assessor);
  return (
    <div className="flex items-center gap-2.5">
      <Photo a={assessor} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-900">
          {assessor.name}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <Badge tone={badge.tone}>{badge.label}</Badge>
          {assessor.clearanceExpiry && (
            <span className="text-xs text-gray-500">
              exp. {assessor.clearanceExpiry}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Full card: photo, name, title, clearance, contact, notes.
 * For assessment headers and detail views.
 */
export function AssessorCard({ assessor }: { assessor: Assessor }) {
  const badge = clearanceInfo(assessor);
  return (
    <div className="flex gap-3 rounded-xl border border-gray-200 bg-white p-3">
      <Photo a={assessor} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-gray-900">
          {assessor.name}
        </p>
        {assessor.title && (
          <p className="truncate text-xs text-gray-500">{assessor.title}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge tone={badge.tone}>{badge.label}</Badge>
          {assessor.clearanceExpiry && (
            <span className="text-xs text-gray-500">
              exp. {assessor.clearanceExpiry}
            </span>
          )}
        </div>
        {(assessor.phone || assessor.email) && (
          <p className="mt-1.5 truncate text-xs text-gray-500">
            {[assessor.phone, assessor.email].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

/** Placeholder row when no assessor is assigned yet. */
export function AssessorUnassigned() {
  return (
    <div className="flex items-center gap-2.5">
      <div
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-sm font-bold text-gray-400"
      >
        ?
      </div>
      <p className="text-sm text-gray-500">Unassigned</p>
    </div>
  );
}
