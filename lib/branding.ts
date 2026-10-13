/**
 * Report branding (white-label) — the business identity that appears
 * on client-facing reports (print view + shared HTML). Per-device
 * localStorage until accounts arrive. An independent assessor's
 * reports should carry THEIR company, not the tool's.
 */
"use client";

import { useEffect, useState } from "react";

export interface Branding {
  companyName: string;
  logoDataUrl?: string;
}

const LS_KEY = "sat_branding";
export const BRANDING_EVENT = "sat:branding-changed";

export function getBranding(): Branding | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw) as Branding;
    return b && typeof b.companyName === "string" ? b : null;
  } catch {
    return null;
  }
}

export function setBranding(b: Branding | null): void {
  if (typeof window === "undefined") return;
  try {
    if (b && (b.companyName.trim() || b.logoDataUrl)) {
      window.localStorage.setItem(LS_KEY, JSON.stringify(b));
    } else {
      window.localStorage.removeItem(LS_KEY);
    }
  } catch {
    /* ignore */
  }
  window.dispatchEvent(
    new CustomEvent<Branding | null>(BRANDING_EVENT, { detail: b })
  );
}

export function useBranding(): [Branding | null, (b: Branding | null) => void] {
  const [branding, setState] = useState<Branding | null>(null);
  useEffect(() => {
    setState(getBranding());
    const handler = (e: Event) =>
      setState((e as CustomEvent<Branding | null>).detail);
    window.addEventListener(BRANDING_EVENT, handler);
    return () => window.removeEventListener(BRANDING_EVENT, handler);
  }, []);
  const set = (b: Branding | null) => {
    setBranding(b);
    setState(b);
  };
  return [branding, set];
}

/** Shrink an uploaded logo to a max 400px PNG data URL (keeps transparency). */
export async function compressLogo(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 400 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/png");
}
