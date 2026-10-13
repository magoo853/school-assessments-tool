/**
 * Photo evidence storage.
 *
 * Photos live in their OWN localStorage table (`sat_<mode>_photos`,
 * mode-scoped like every other table) as compressed JPEG data URLs —
 * never inline in ResponseRow/Finding, so those rows stay small and
 * export-clean. Rows reference photos via `photoIds: string[]`.
 *
 * ── Supabase Storage migration point ─────────────────────────────
 * When shared storage lands, swap the table below for Supabase Storage:
 *   - save:   supabase.storage.from("photos").upload(path, blob)
 *   - read:   supabase.storage.from("photos").download(path) → object URL
 *             (or a signed URL stored on the PhotoDoc)
 *   - delete: supabase.storage.from("photos").remove([path])
 * Keep the PhotoDoc shape and the savePhoto/getPhoto/deletePhoto/photosFor
 * API — callers (PhotoPicker, print view, share-HTML builder) don't change.
 * ─────────────────────────────────────────────────────────────────
 */
"use client";

import { ensureMigration, modeKey, nowIso, uid } from "./store";

export interface PhotoDoc {
  id: string;
  /** Compressed JPEG data URL (localStorage era). */
  dataUrl: string;
  caption: string;
  createdAt: string;
}

function photosKey(): string {
  return modeKey("photos");
}
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.7;

function canStore(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function readAll(): PhotoDoc[] {
  if (!canStore()) return [];
  ensureMigration();
  try {
    const raw = window.localStorage.getItem(photosKey());
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PhotoDoc[]) : [];
  } catch {
    return [];
  }
}

function writeAll(docs: PhotoDoc[]): void {
  if (!canStore()) return;
  ensureMigration();
  window.localStorage.setItem(photosKey(), JSON.stringify(docs));
}

export function getPhoto(id: string): PhotoDoc | undefined {
  return readAll().find((d) => d.id === id);
}

/** Resolve an id list to docs, preserving order and skipping missing. */
export function photosFor(ids: string[] | undefined): PhotoDoc[] {
  if (!ids || !ids.length) return [];
  const all = readAll();
  return ids
    .map((id) => all.find((d) => d.id === id))
    .filter((d): d is PhotoDoc => !!d);
}

export function deletePhoto(id: string): void {
  try {
    writeAll(readAll().filter((d) => d.id !== id));
  } catch {
    /* a failed delete write leaves the photo in place — never throws */
  }
}

/** All stored photo docs (storage-usage / orphan-cleanup callers). */
export function listPhotos(): PhotoDoc[] {
  return readAll();
}

/** Delete several photos in one write. Returns how many were removed. */
export function deletePhotos(ids: string[]): number {
  if (!ids.length) return 0;
  const drop = new Set(ids);
  const all = readAll();
  const kept = all.filter((d) => !drop.has(d.id));
  if (kept.length !== all.length) {
    try {
      writeAll(kept);
    } catch {
      return 0;
    }
  }
  return all.length - kept.length;
}

function loadBitmap(file: Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  // Fallback for older browsers: draw through an <img>.
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      createImageBitmap(img)
        .then((b) => {
          URL.revokeObjectURL(url);
          resolve(b);
        })
        .catch(reject);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

async function compressToDataUrl(file: Blob): Promise<string> {
  const bmp = await loadBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bmp, 0, 0, w, h);
  if (typeof bmp.close === "function") bmp.close();
  const dataUrl: string | null = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  if (!dataUrl || !dataUrl.startsWith("data:image/jpeg")) {
    throw new Error("Compression failed");
  }
  return dataUrl;
}

/** Compress an image file to a JPEG data URL (max edge 1280, q0.7) —
 *  shared by the photo pipeline and assessor-media uploads. */
export async function compressImageFile(file: Blob): Promise<string> {
  return compressToDataUrl(file);
}

export type SaveResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Compress and store a photo. Returns { ok:false, error } with a friendly
 * message when the device storage quota is exceeded.
 */
export async function savePhoto(
  file: Blob,
  caption = ""
): Promise<SaveResult> {
  try {
    const dataUrl = await compressToDataUrl(file);
    const doc: PhotoDoc = { id: uid("pho"), dataUrl, caption, createdAt: nowIso() };
    const all = readAll();
    all.push(doc);
    try {
      writeAll(all);
    } catch (e) {
      const msg =
        e instanceof DOMException &&
        (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED")
          ? "Device storage is full — delete old photos or free space, then try again."
          : "Could not save the photo on this device.";
      return { ok: false, error: msg };
    }
    return { ok: true, id: doc.id };
  } catch {
    return { ok: false, error: "That file couldn't be read as an image." };
  }
}
