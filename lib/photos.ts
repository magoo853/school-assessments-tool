/**
 * Photo evidence storage — IndexedDB era (scale build, 2026-10-14).
 *
 * Photos used to live in localStorage (`sat_<mode>_photos`) as
 * compressed JPEG data URLs. localStorage caps around 5–10 MB per
 * origin — at ~200–500 KB per compressed photo that is a few dozen
 * photos per device, which a district-scale assessor blows through
 * in weeks. Photos now persist in IndexedDB (origin quota is
 * typically hundreds of MB to GBs, reported by
 * navigator.storage.estimate()), behind the SAME API as before:
 *
 *   savePhoto (async) · getPhoto / photosFor / listPhotos (sync) ·
 *   deletePhoto / deletePhotos (sync, write-through)
 *
 * The sync reads are served from an in-memory cache hydrated once
 * per mode by photosReady() (Shell awaits it on mount and on mode
 * switch and re-renders, so render-time readers see the photos).
 * savePhoto awaits persistence before resolving, so a photo is never
 * "saved" only in memory.
 *
 * Migration: on first hydration, any photos still in the legacy
 * localStorage table are copied into IndexedDB; the localStorage
 * copy is removed ONLY after every legacy id is verified present in
 * IndexedDB (the quota is reclaimed, the evidence is never lost).
 * If IndexedDB is unavailable (rare; hardened private modes), the
 * store falls back to the legacy localStorage backend wholesale so
 * the app keeps working with the old ceiling rather than breaking.
 *
 * ── Supabase Storage migration point ─────────────────────────────
 * When shared storage lands, swap the backend below for Supabase
 * Storage: upload/download/remove + signed URLs on the PhotoDoc.
 * Keep the PhotoDoc shape and this API — callers don't change.
 * ─────────────────────────────────────────────────────────────────
 */
"use client";

import { ensureMigration, nowIso, uid } from "./store";
import { getMode, type Mode } from "./mode";

export interface PhotoDoc {
  id: string;
  /** Compressed JPEG data URL (on-device era). */
  dataUrl: string;
  caption: string;
  createdAt: string;
}

const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.7;

/* ── Legacy localStorage table ─────────────────────────────────── */

function lsKey(mode: Mode): string {
  return `sat_${mode}_photos`;
}

function canUseLs(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function readLsPhotos(mode: Mode): PhotoDoc[] {
  if (!canUseLs()) return [];
  try {
    const raw = window.localStorage.getItem(lsKey(mode));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PhotoDoc[]) : [];
  } catch {
    return [];
  }
}

function writeLsPhotos(mode: Mode, docs: PhotoDoc[]): void {
  if (!canUseLs()) return;
  window.localStorage.setItem(lsKey(mode), JSON.stringify(docs));
}

/* ── IndexedDB backend ─────────────────────────────────────────── */

const DB_NAME = "sat-photos-v1";
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      let req: IDBOpenDBRequest;
      try {
        req = indexedDB.open(DB_NAME, 1);
      } catch {
        resolve(null);
        return;
      }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("demo"))
          d.createObjectStore("demo", { keyPath: "id" });
        if (!d.objectStoreNames.contains("prod"))
          d.createObjectStore("prod", { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    });
  }
  return dbPromise;
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB error"));
  });
}

function idbTxDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB error"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB aborted"));
  });
}

async function idbGetAll(mode: Mode): Promise<PhotoDoc[]> {
  const db = await openDb();
  if (!db) return [];
  return idbRequest(db.transaction(mode, "readonly").objectStore(mode).getAll());
}

async function idbPut(mode: Mode, doc: PhotoDoc): Promise<void> {
  const db = await openDb();
  if (!db) throw new Error("IndexedDB unavailable");
  const tx = db.transaction(mode, "readwrite");
  tx.objectStore(mode).put(doc);
  await idbTxDone(tx);
}

async function idbDelete(mode: Mode, id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const tx = db.transaction(mode, "readwrite");
  tx.objectStore(mode).delete(id);
  await idbTxDone(tx);
}

async function idbReplaceAll(mode: Mode, docs: PhotoDoc[]): Promise<void> {
  const db = await openDb();
  if (!db) throw new Error("IndexedDB unavailable");
  const tx = db.transaction(mode, "readwrite");
  const store = tx.objectStore(mode);
  store.clear();
  for (const d of docs) store.put(d);
  await idbTxDone(tx);
}

/* ── Per-mode cache + hydration (incl. legacy migration) ───────── */

interface ModeState {
  backend: "idb" | "ls" | null;
  cache: Map<string, PhotoDoc>;
  ready: Promise<void> | null;
}

const states = new Map<Mode, ModeState>();

function stateFor(mode: Mode): ModeState {
  let st = states.get(mode);
  if (!st) {
    st = { backend: null, cache: new Map(), ready: null };
    states.set(mode, st);
  }
  return st;
}

function hydrate(mode: Mode): Promise<void> {
  const st = stateFor(mode);
  if (st.ready) return st.ready;
  st.ready = (async () => {
    ensureMigration();
    const legacy = readLsPhotos(mode);
    const db = await openDb();
    if (db) {
      st.backend = "idb";
      let all: PhotoDoc[] = [];
      try {
        all = await idbGetAll(mode);
      } catch {
        all = [];
      }
      if (legacy.length) {
        const have = new Set(all.map((d) => d.id));
        const missing = legacy.filter((d) => !have.has(d.id));
        for (const d of missing) {
          try {
            await idbPut(mode, d);
          } catch {
            /* verified below — an un-copied photo keeps its LS copy */
          }
        }
        try {
          all = await idbGetAll(mode);
        } catch {
          /* keep the earlier read */
        }
        const afterIds = new Set(all.map((d) => d.id));
        if (legacy.every((d) => afterIds.has(d.id))) {
          // Every legacy photo is verified in IndexedDB — reclaim
          // the localStorage quota.
          try {
            window.localStorage.removeItem(lsKey(mode));
          } catch {
            /* removal is best-effort */
          }
        }
      }
      for (const d of all) st.cache.set(d.id, d);
    } else {
      // No IndexedDB: legacy backend, old ceiling, app still works.
      st.backend = "ls";
      for (const d of legacy) st.cache.set(d.id, d);
    }
  })();
  return st.ready;
}

/** Resolve when the current mode's photos are loaded into memory. */
export function photosReady(): Promise<void> {
  return hydrate(getMode());
}

// Self-hydration: in the browser, start loading the current mode's
// photos as soon as this module is evaluated, so the cache is warm
// by first paint in the common path. photosReady() remains the
// deterministic await for print/report/share paths, and Shell
// re-renders the tree once hydration lands.
if (typeof window !== "undefined") {
  void hydrate(getMode()).catch(() => {});
}

/* ── Public API (unchanged shape) ──────────────────────────────── */

export function getPhoto(id: string): PhotoDoc | undefined {
  return stateFor(getMode()).cache.get(id);
}

/** Resolve an id list to docs, preserving order and skipping missing. */
export function photosFor(ids: string[] | undefined): PhotoDoc[] {
  if (!ids || !ids.length) return [];
  const cache = stateFor(getMode()).cache;
  return ids
    .map((id) => cache.get(id))
    .filter((d): d is PhotoDoc => !!d);
}

/** All stored photo docs (storage-usage / orphan-cleanup callers). */
export function listPhotos(): PhotoDoc[] {
  return [...stateFor(getMode()).cache.values()];
}

function persistDelete(mode: Mode, id: string): void {
  const st = stateFor(mode);
  if (st.backend === "idb") {
    void idbDelete(mode, id).catch(() => {});
  } else if (st.backend === "ls") {
    try {
      writeLsPhotos(mode, [...st.cache.values()]);
    } catch {
      /* a failed delete write leaves the photo in place */
    }
  }
}

export function deletePhoto(id: string): void {
  const mode = getMode();
  const st = stateFor(mode);
  if (!st.cache.delete(id)) return;
  persistDelete(mode, id);
}

/** Delete several photos in one pass. Returns how many were removed. */
export function deletePhotos(ids: string[]): number {
  if (!ids.length) return 0;
  const mode = getMode();
  const st = stateFor(mode);
  let removed = 0;
  for (const id of ids) {
    if (st.cache.delete(id)) removed++;
  }
  if (removed > 0) {
    if (st.backend === "idb") {
      for (const id of ids) void idbDelete(mode, id).catch(() => {});
    } else if (st.backend === "ls") {
      try {
        writeLsPhotos(mode, [...st.cache.values()]);
      } catch {
        /* cache already reflects the delete */
      }
    }
  }
  return removed;
}

/**
 * Replace a mode's ENTIRE photo set (backup restore). Returns false
 * when persistence failed so the caller can report the entry as
 * skipped instead of pretending the photos made it.
 */
export async function replacePhotosForMode(
  mode: Mode,
  docs: PhotoDoc[]
): Promise<boolean> {
  await hydrate(mode);
  const st = stateFor(mode);
  const valid = docs.filter(
    (d) =>
      d &&
      typeof d.id === "string" &&
      typeof d.dataUrl === "string" &&
      d.dataUrl.startsWith("data:image/")
  );
  try {
    if (st.backend === "idb") {
      await idbReplaceAll(mode, valid);
    } else {
      writeLsPhotos(mode, valid);
    }
  } catch {
    return false;
  }
  st.cache = new Map(valid.map((d) => [d.id, d]));
  return true;
}

/* ── Capture + compression (unchanged) ─────────────────────────── */
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
 * Compress and store a photo. Persists BEFORE resolving, so a photo
 * that reports saved is durable. Returns { ok:false, error } with a
 * friendly message when the device storage quota is exceeded.
 */
export async function savePhoto(
  file: Blob,
  caption = ""
): Promise<SaveResult> {
  try {
    const dataUrl = await compressToDataUrl(file);
    const mode = getMode();
    await hydrate(mode);
    const st = stateFor(mode);
    const doc: PhotoDoc = {
      id: uid("pho"),
      dataUrl,
      caption,
      createdAt: nowIso(),
    };
    try {
      if (st.backend === "idb") {
        await idbPut(mode, doc);
      } else {
        writeLsPhotos(mode, [...st.cache.values(), doc]);
      }
    } catch (e) {
      const msg =
        e instanceof DOMException &&
        (e.name === "QuotaExceededError" ||
          e.name === "NS_ERROR_DOM_QUOTA_REACHED")
          ? "Device storage is full — delete old photos or free space, then try again."
          : "Could not save the photo on this device.";
      return { ok: false, error: msg };
    }
    st.cache.set(doc.id, doc);
    return { ok: true, id: doc.id };
  } catch {
    return { ok: false, error: "That file couldn't be read as an image." };
  }
}
