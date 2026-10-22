/**
 * School Assessments Tool — service worker.
 *
 * Offline strategy (field-first: schools have dead zones):
 * - Navigations: network-first, falling back to the cached page when offline.
 * - /_next/static/* assets: cache-first (content-hashed, immutable).
 * - Other same-origin GETs: stale-while-revalidate.
 * - Versioned cache name: bump CACHE to invalidate on deploy.
 *
 * Data itself lives in localStorage, so the app keeps working fully
 * offline; this worker only keeps the app shell loadable without signal.
 */

const CACHE = "sat-shell-v31";

self.addEventListener("install", (event) => {
  // Deliberately NO skipWaiting() here: a new version parks in the
  // "waiting" state so the page can prompt "New version available —
  // tap to update" (lib/swUpdate.ts + Shell banner). First installs
  // still activate immediately — there is no older worker to wait for.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["/", "/manifest.json"]))
  );
});

// The page sends this only after the user taps "Update now".
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Immutable build assets: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          })
      )
    );
    return;
  }

  // Navigations: network-first with cached fallback. Only cache OK
  // responses — a transient 404/500 page must not become the shell
  // served offline later.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/")))
    );
    return;
  }

  // API calls: network-only. Health checks and drafts must never be
  // served stale from the SWR cache below.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Everything else same-origin: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      });
      return hit || network;
    })
  );
});
