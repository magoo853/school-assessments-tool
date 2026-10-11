/**
 * PhotoPicker — camera/gallery capture with thumbnail strip and viewer.
 * Photos are stored via lib/photos.ts (own localStorage table, compressed
 * data URLs); callers keep only the id list.
 */
"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui";
import {
  savePhoto,
  deletePhoto,
  photosFor,
  type PhotoDoc,
} from "@/lib/photos";

export function PhotoPicker({
  photoIds,
  onChange,
}: {
  photoIds: string[] | undefined;
  onChange: (ids: string[]) => void;
}) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewer, setViewer] = useState<PhotoDoc | null>(null);
  const [tick, setTick] = useState(0);

  const ids = photoIds ?? [];
  const photos = photosFor(ids);
  void tick; // re-render after delete (photosFor reads localStorage)

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setError(null);
    setSaving(true);
    const next = [...ids];
    for (const file of Array.from(files)) {
      const res = await savePhoto(file);
      if (res.ok) next.push(res.id);
      else {
        setError(res.error);
        break;
      }
    }
    setSaving(false);
    if (next.length !== ids.length) onChange(next);
  };

  const remove = (id: string) => {
    deletePhoto(id);
    onChange(ids.filter((x) => x !== id));
    setViewer(null);
    setTick((t) => t + 1);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={saving}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:border-violet-300 hover:text-violet-700 disabled:opacity-50"
        >
          📷 {saving ? "Saving…" : "Camera"}
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          disabled={saving}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:border-violet-300 hover:text-violet-700 disabled:opacity-50"
        >
          🖼 Add photo
        </button>
        {photos.length > 0 && (
          <span className="inline-flex min-h-[44px] items-center text-xs text-slate-400">
            {photos.length} photo{photos.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {error && (
        <p className="mt-2 text-sm font-medium text-rose-700" role="alert">
          {error}
        </p>
      )}
      {photos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {photos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setViewer(p)}
              className="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 transition-transform hover:scale-105"
              aria-label="View photo"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.dataUrl}
                alt={p.caption || "Evidence photo"}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
      {viewer && (
        <Modal title="Photo evidence" onClose={() => setViewer(null)}>
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewer.dataUrl}
              alt={viewer.caption || "Evidence photo"}
              className="max-h-[60vh] w-full rounded-xl object-contain bg-slate-950"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Captured {new Date(viewer.createdAt).toLocaleString()}
              </p>
              <button
                type="button"
                onClick={() => remove(viewer.id)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50"
              >
                🗑 Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
