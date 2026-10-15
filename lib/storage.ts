/**
 * Device-storage headroom (localStorage era).
 *
 * All app data lives in localStorage under `sat_` keys; photos
 * (`sat_photos`, compressed JPEG data URLs) are by far the largest
 * consumer, and the browser quota (~5 MB on many devices, more on
 * others) bites silently in the field — savePhoto() then fails with a
 * generic storage-full error. This module measures actual usage so
 * Integrations can warn BEFORE that happens, and finds photos that no
 * live response or finding references any more (orphans left behind
 * when a finding/response was deleted) so they can be cleaned up.
 *
 * Pure helpers (summarizeUsage / storageLevel / referencedPhotoIds /
 * orphanedPhotos / formatBytes) take plain data so they can be tested
 * outside the browser; the localStorage-facing wrappers read the real
 * store. No data-model change: this only reads existing tables.
 */
"use client";

import { db } from "./store";
import { listPhotos, deletePhotos, type PhotoDoc } from "./photos";

/** Photos for the ACTIVE mode live under sat_<mode>_photos. */

/** Typical localStorage quota when the browser won't report one.
 *  Used ONLY as a labeled estimate — never presented as exact. */
export const FALLBACK_QUOTA_BYTES = 5 * 1024 * 1024;

/** navigator.storage.estimate() reports an ORIGIN-wide quota that can
 *  be hundreds of MB — localStorage itself still caps out around
 *  5–10MB. Measuring our bytes against the origin quota made the
 *  warnings read ~0% on a nearly-full device, so the fraction is
 *  measured against a localStorage-class cap. */
export const LOCALSTORAGE_CLASS_CAP = 10 * 1024 * 1024;

export interface KeyUsage {
  key: string;
  bytes: number;
}

export interface UsageSummary {
  totalBytes: number;
  /** Per-key usage, largest first. */
  byKey: KeyUsage[];
  photosBytes: number;
  /** 0..1 share of total usage taken by sat_photos (0 when empty). */
  photosShare: number;
  /** Quota the fraction is measured against. */
  quotaBytes: number;
  /** True when quotaBytes is the fallback estimate, not browser-reported. */
  quotaIsEstimate: boolean;
  /** totalBytes / quotaBytes. */
  fraction: number;
}

export type StorageLevel = "ok" | "warning" | "critical";

/** UTF-8 byte length of a string (data URLs are ASCII, so this is
 *  effectively their stored character count). */
export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * Summarize usage from raw localStorage entries (key → value).
 * Only `sat_` keys count — that's the app's dataset.
 */
export function summarizeUsage(
  entries: Iterable<readonly [string, string]>,
  quotaBytes?: number | null
): UsageSummary {
  const byKey: KeyUsage[] = [];
  let totalBytes = 0;
  let photosBytes = 0;
  for (const [key, value] of entries) {
    if (!key.startsWith("sat_")) continue;
    const bytes = byteLength(key) + byteLength(value);
    byKey.push({ key, bytes });
    totalBytes += bytes;
    if (key.endsWith("_photos")) photosBytes = bytes;
  }
  byKey.sort((a, b) => b.bytes - a.bytes);
  const reported = quotaBytes && quotaBytes > 0 ? quotaBytes : null;
  const quotaIsEstimate = reported === null || reported > LOCALSTORAGE_CLASS_CAP;
  const quota =
    reported === null
      ? FALLBACK_QUOTA_BYTES
      : Math.min(reported, LOCALSTORAGE_CLASS_CAP);
  return {
    totalBytes,
    byKey,
    photosBytes,
    photosShare: totalBytes > 0 ? photosBytes / totalBytes : 0,
    quotaBytes: quota,
    quotaIsEstimate,
    fraction: quota > 0 ? totalBytes / quota : 0,
  };
}

/** Warning at 70% of quota, critical at 90% — early enough to act. */
export function storageLevel(fraction: number): StorageLevel {
  if (fraction >= 0.9) return "critical";
  if (fraction >= 0.7) return "warning";
  return "ok";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Every photo id referenced by a live response row or finding. */
export function referencedPhotoIds(
  rows: Iterable<{ photoIds?: string[] }>
): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const id of row.photoIds ?? []) ids.add(id);
  }
  return ids;
}

/**
 * Photos no live response or finding references. These are leftovers
 * from deleted findings/responses (or removed photo picks whose row
 * was later re-derived) — safe to delete; nothing renders them.
 */
export function orphanedPhotos(
  photos: PhotoDoc[],
  referenced: Set<string>
): PhotoDoc[] {
  return photos.filter((p) => !referenced.has(p.id));
}

export function photosByteSize(photos: PhotoDoc[]): number {
  let n = 0;
  for (const p of photos) n += byteLength(p.dataUrl) + byteLength(p.caption ?? "");
  return n;
}

/* ── localStorage-facing wrappers ─────────────────────────────── */

function canStore(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function readEntries(): [string, string][] {
  if (!canStore()) return [];
  const out: [string, string][] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    const value = window.localStorage.getItem(key);
    if (value != null) out.push([key, value]);
  }
  return out;
}

/**
 * Current usage. Prefers the browser-reported quota from
 * navigator.storage.estimate() (its `usage` counts more than
 * localStorage, so only its `quota` is used, against our own
 * localStorage byte count); falls back to the labeled estimate.
 */
export async function getStorageUsage(): Promise<UsageSummary> {
  let quota: number | null = null;
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      if (est.quota && est.quota > 0) quota = est.quota;
    }
  } catch {
    quota = null;
  }
  // A migrated mode keeps its legacy LS photos table as a cold copy
  // (lib/photos.ts) — exclude it here so the same photos aren't
  // counted twice; the IndexedDB line below is the real figure.
  const entries = readEntries().filter(([k]) => {
    if (!k.endsWith("_photos")) return true;
    try {
      return !window.localStorage.getItem(k + "_idb");
    } catch {
      return true;
    }
  });
  const summary = summarizeUsage(entries, quota);
  // Photos live in IndexedDB now (scale build, 2026-10-14): count
  // them from the photo store so the meter stays honest about total
  // on-device data. They no longer press on the localStorage cap, so
  // `fraction` keeps measuring localStorage-resident bytes only —
  // that is still the ceiling that can bite the remaining tables.
  const photos = listPhotos();
  if (photos.length) {
    const pb = photosByteSize(photos);
    summary.photosBytes = pb;
    summary.totalBytes += pb;
    summary.photosShare =
      summary.totalBytes > 0 ? pb / summary.totalBytes : 0;
    summary.byKey.push({ key: "photos (IndexedDB)", bytes: pb });
    summary.byKey.sort((a, b) => b.bytes - a.bytes);
  }
  return summary;
}

export function getOrphanedPhotos(): PhotoDoc[] {
  const referenced = referencedPhotoIds([
    ...db.responses.list(),
    ...db.findings.list(),
  ]);
  return orphanedPhotos(listPhotos(), referenced);
}

/** Delete every orphaned photo. Returns how many were removed. */
export function deleteOrphanedPhotos(): number {
  const orphans = getOrphanedPhotos();
  if (orphans.length === 0) return 0;
  deletePhotos(orphans.map((p) => p.id));
  return orphans.length;
}
