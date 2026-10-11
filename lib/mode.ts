/**
 * Demo / Prod mode. Mirrors the hub's per-device cookie switch.
 * - Cookie "sat_mode" (1 year), mirrored in localStorage.
 * - Defaults to "demo". Never auto-detects anything.
 * - Demo mode: fictional seed data is installed (see lib/seed.ts).
 * - Prod mode: tables stay empty; UI shows a "live database not connected"
 *   notice until Supabase is wired up.
 */
"use client";

import { useEffect, useState } from "react";

export type Mode = "demo" | "prod";

const COOKIE = "sat_mode";
const LS_KEY = "sat_mode_ls";
export const MODE_EVENT = "sat:mode-changed";

function readCookie(): Mode | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m && (m[1] === "demo" || m[1] === "prod") ? (m[1] as Mode) : null;
}

export function getMode(): Mode {
  const c = readCookie();
  if (c) return c;
  if (typeof window !== "undefined") {
    const ls = window.localStorage.getItem(LS_KEY);
    if (ls === "demo" || ls === "prod") return ls;
  }
  return "demo";
}

export function setMode(mode: Mode): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE}=${mode}; path=/; max-age=31536000; samesite=lax`;
  try {
    window.localStorage.setItem(LS_KEY, mode);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(MODE_EVENT, { detail: mode }));
}

export function onModeChange(cb: (mode: Mode) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<Mode>).detail);
  window.addEventListener(MODE_EVENT, handler);
  return () => window.removeEventListener(MODE_EVENT, handler);
}

/** React hook: current mode, re-renders on change. */
export function useMode(): [Mode, (m: Mode) => void] {
  const [mode, setModeState] = useState<Mode>("demo");
  useEffect(() => {
    setModeState(getMode());
    return onModeChange(setModeState);
  }, []);
  const set = (m: Mode) => {
    setMode(m);
    setModeState(m);
  };
  return [mode, set];
}
