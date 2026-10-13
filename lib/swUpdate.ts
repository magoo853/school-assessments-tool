/**
 * PWA update bridge between SwRegister and the Shell.
 *
 * The service worker no longer calls skipWaiting() on install, so a new
 * version parks in the "waiting" state. SwRegister detects that state and
 * calls notifySwUpdate(); the Shell subscribes and shows a
 * "New version available — tap to update" banner. Tapping calls
 * applySwUpdate(), which messages the waiting worker to activate; the
 * resulting controllerchange (handled in SwRegister) reloads the page
 * onto the fresh shell instead of silently serving the stale one.
 */
"use client";

export const SW_UPDATE_EVENT = "sat:sw-update-available";

let pendingWorker: ServiceWorker | null = null;

/**
 * Pure decision: a worker reaching "installed" is an *update* only when
 * an older worker already controls the page. On first install there is
 * no controller and nothing to prompt about.
 */
export function isUpdateWaiting(
  workerState: string,
  hasController: boolean
): boolean {
  return workerState === "installed" && hasController;
}

/** Record a waiting worker and notify any current/future subscribers. */
export function notifySwUpdate(worker: ServiceWorker): void {
  pendingWorker = worker;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SW_UPDATE_EVENT));
  }
}

/** True when a new version is already known to be waiting. */
export function hasSwUpdate(): boolean {
  return pendingWorker !== null;
}

/**
 * Subscribe to update availability. Fires immediately if an update was
 * already detected before the subscriber mounted (mount order between
 * SwRegister and Shell is not guaranteed). Returns an unsubscribe fn.
 */
export function onSwUpdate(cb: () => void): () => void {
  if (pendingWorker) cb();
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(SW_UPDATE_EVENT, handler);
  return () => window.removeEventListener(SW_UPDATE_EVENT, handler);
}

/** Ask the waiting worker to take over; the page reloads on activation. */
export function applySwUpdate(): void {
  pendingWorker?.postMessage({ type: "SKIP_WAITING" });
}
