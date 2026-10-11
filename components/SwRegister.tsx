/**
 * Registers the service worker (public/sw.js). Safe no-op when unsupported
 * or when the worker file is missing.
 */
"use client";

import { useEffect } from "react";

export default function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Only in production builds — dev's hot-reload and the worker fight.
    if (window.location.hostname === "localhost") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline support unavailable; app still works online */
    });
  }, []);
  return null;
}
