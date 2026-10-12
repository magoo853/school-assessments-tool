/**
 * AI drafting ON/OFF — per-device user preference (localStorage).
 * Mirrors the lib/mode.ts pattern. Default: ON. When OFF, every
 * "Draft with AI" affordance hides and drafting stays template-based.
 */
"use client";

import { useEffect, useState } from "react";

const LS_KEY = "sat_ai_enabled";
export const AI_EVENT = "sat:ai-changed";

export function getAiEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(LS_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setAiEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<boolean>(AI_EVENT, { detail: on }));
}

export function onAiChange(cb: (on: boolean) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent<boolean>).detail);
  window.addEventListener(AI_EVENT, handler);
  return () => window.removeEventListener(AI_EVENT, handler);
}

/** React hook: AI enabled state, re-renders on change. */
export function useAiEnabled(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(getAiEnabled());
    return onAiChange(setOn);
  }, []);
  const set = (v: boolean) => {
    setAiEnabled(v);
    setOn(v);
  };
  return [on, set];
}
