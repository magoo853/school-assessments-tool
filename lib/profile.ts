/**
 * My Profile — who's using this device. Per-device (localStorage)
 * until real accounts arrive with the shared-database phase.
 * A profile is a name, optionally linked to an assessor-directory
 * record (which brings photo, title, and clearance with it).
 * The dashboard greets you by first name.
 */
"use client";

import { useEffect, useState } from "react";

export interface MyProfile {
  name: string;
  assessorId?: string;
}

const LS_KEY = "sat_profile";
export const PROFILE_EVENT = "sat:profile-changed";

export function getProfile(): MyProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as MyProfile;
    return p && typeof p.name === "string" && p.name.trim() ? p : null;
  } catch {
    return null;
  }
}

export function setProfile(p: MyProfile | null): void {
  if (typeof window === "undefined") return;
  try {
    if (p) window.localStorage.setItem(LS_KEY, JSON.stringify(p));
    else window.localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<MyProfile | null>(PROFILE_EVENT, { detail: p }));
}

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function useProfile(): [MyProfile | null, (p: MyProfile | null) => void] {
  const [profile, setState] = useState<MyProfile | null>(null);
  useEffect(() => {
    setState(getProfile());
    const handler = (e: Event) =>
      setState((e as CustomEvent<MyProfile | null>).detail);
    window.addEventListener(PROFILE_EVENT, handler);
    return () => window.removeEventListener(PROFILE_EVENT, handler);
  }, []);
  const set = (p: MyProfile | null) => {
    setProfile(p);
    setState(p);
  };
  return [profile, set];
}
