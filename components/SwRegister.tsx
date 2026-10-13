/**
 * Registers the service worker (public/sw.js) and watches for updates.
 *
 * When a new worker finishes installing while an older one controls the
 * page, it stays in the "waiting" state (sw.js no longer skipWaiting()s
 * on its own) — we hand it to lib/swUpdate so the Shell can prompt the
 * user. Applying the update activates the waiting worker; the
 * controllerchange listener then reloads once onto the fresh shell.
 * Safe no-op when unsupported or when the worker file is missing.
 */
"use client";

import { useEffect } from "react";
import { isUpdateWaiting, notifySwUpdate } from "@/lib/swUpdate";

export default function SwRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Only in production builds — dev's hot-reload and the worker fight.
    if (window.location.hostname === "localhost") return;

    // Reload once when a new worker takes control — but only if an old
    // worker controlled this page at load (never on first install).
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    const onControllerChange = () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    );

    let registration: ServiceWorkerRegistration | undefined;
    const watchWorker = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (
          isUpdateWaiting(
            worker.state,
            Boolean(navigator.serviceWorker.controller)
          )
        ) {
          notifySwUpdate(worker);
        }
      });
    };
    const onUpdateFound = () => watchWorker(registration?.installing ?? null);
    // Returning to the app is when a field device most needs the check.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        registration?.update().catch(() => {});
      }
    };

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registration = reg;
        // An update may already be waiting from a previous visit.
        if (
          reg.waiting &&
          isUpdateWaiting(reg.waiting.state, hadController)
        ) {
          notifySwUpdate(reg.waiting);
        }
        watchWorker(reg.installing);
        reg.addEventListener("updatefound", onUpdateFound);
        document.addEventListener("visibilitychange", onVisible);
      })
      .catch(() => {
        /* offline support unavailable; app still works online */
      });

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
      registration?.removeEventListener("updatefound", onUpdateFound);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
