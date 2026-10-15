/**
 * Integrations — external connections and their status.
 * AI drafting runs on Google Gemini's free tier (OpenAI-compatible
 * endpoint). Configure it right here: paste a free AI Studio key and
 * it's stored on this device only, sent per-request to /api/draft.
 * Alternatively set AI_API_KEY in the Vercel env vars to cover every
 * device. Users can also turn AI drafting off per device; template
 * drafting always works.
 */
"use client";

import { useEffect, useState } from "react";
import { Card, PageHeader, Badge, Btn, inputCls } from "@/components/ui";
import { useAiEnabled, getAiKey, setAiKey } from "@/lib/aiSettings";
import {
  getStorageUsage,
  getOrphanedPhotos,
  deleteOrphanedPhotos,
  storageLevel,
  formatBytes,
  photosByteSize,
  type UsageSummary,
} from "@/lib/storage";
import { photosReady, type PhotoDoc } from "@/lib/photos";
import { getCorruptKeys } from "@/lib/store";
import {
  getEquipmentCleanupPlan,
  cleanupStaleEquipmentLinks,
  type EquipmentCleanupPlan,
} from "@/lib/equipmentCleanup";

interface Health {
  configured: boolean;
  working: boolean;
  provider: string;
  model: string;
}

export default function IntegrationsPage() {
  const [aiOn, setAiOn] = useAiEnabled();
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(false);
  const [savedKey, setSavedKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [deviceWorking, setDeviceWorking] = useState<boolean | null>(null);
  const [keyMsg, setKeyMsg] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [corruptKeys, setCorruptKeys] = useState<string[]>([]);
  const [orphans, setOrphans] = useState<PhotoDoc[]>([]);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [storageMsg, setStorageMsg] = useState<string | null>(null);
  const [equipPlan, setEquipPlan] = useState<EquipmentCleanupPlan | null>(null);
  const [confirmEquipCleanup, setConfirmEquipCleanup] = useState(false);
  const [equipMsg, setEquipMsg] = useState<string | null>(null);

  const loadStorage = async () => {
    await photosReady();
    setUsage(await getStorageUsage());
    setCorruptKeys(getCorruptKeys());
    setOrphans(getOrphanedPhotos());
    setEquipPlan(getEquipmentCleanupPlan());
    setConfirmCleanup(false);
    setConfirmEquipCleanup(false);
  };

  const cleanupEquipment = async () => {
    const applied = cleanupStaleEquipmentLinks();
    setEquipMsg(
      applied.staleCount > 0
        ? `Cleaned up ${applied.staleCount} stale equipment link${applied.staleCount === 1 ? "" : "s"}: removed ${applied.deleteIds.length} duplicate${applied.deleteIds.length === 1 ? "" : "s"}, kept and unlinked ${applied.unlinkIds.length} item${applied.unlinkIds.length === 1 ? "" : "s"}.`
        : "No stale equipment links to clean up."
    );
    await loadStorage();
  };

  const cleanupOrphans = async () => {
    const removed = deleteOrphanedPhotos();
    setStorageMsg(
      removed > 0
        ? `Removed ${removed} orphaned photo${removed === 1 ? "" : "s"}.`
        : "No orphaned photos to remove."
    );
    await loadStorage();
  };

  const testKey = async (key: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/ai-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      const json = (await res.json()) as { working?: boolean };
      return json.working === true;
    } catch {
      return false;
    }
  };

  const check = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/ai-health", { cache: "no-store" });
      setHealth((await res.json()) as Health);
    } catch {
      setHealth(null);
    }
    const k = getAiKey();
    setSavedKey(k);
    if (k) setDeviceWorking(await testKey(k));
    setChecking(false);
  };

  useEffect(() => {
    void check();
    void loadStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveKey = async () => {
    const k = keyInput.trim();
    if (!k) return;
    setChecking(true);
    setKeyMsg(null);
    const ok = await testKey(k);
    if (ok) {
      setAiKey(k);
      setSavedKey(k);
      setDeviceWorking(true);
      setKeyInput("");
      setKeyMsg("Key saved on this device and verified — AI drafting is on.");
    } else {
      setKeyMsg(
        "That key didn't connect. Double-check it in Google AI Studio and paste it again."
      );
    }
    setChecking(false);
  };

  const removeKey = () => {
    setAiKey("");
    setSavedKey("");
    setDeviceWorking(null);
    setKeyMsg("Key removed from this device.");
  };

  const connected = Boolean(health?.working || deviceWorking);
  const statusBadge = !health ? (
    <Badge tone="gray">Checking…</Badge>
  ) : connected ? (
    <Badge tone="green">
      Connected{health?.working ? "" : " — key on this device"}
    </Badge>
  ) : health.configured || savedKey ? (
    <Badge tone="red">Key saved — not connecting</Badge>
  ) : (
    <Badge tone="gray">Not configured</Badge>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        subtitle="Connected services and how they're set up."
      />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">✨ AI drafting</h2>
            <p className="mt-1 max-w-xl text-sm text-slate-500">
              Drafts findings, AAR sections, and recommendations from your
              recorded assessment data. Every draft stays fully editable —
              the AI writes a first pass, you make the call.
            </p>
          </div>
          {statusBadge}
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-400">Provider</dt>
            <dd className="font-medium text-slate-800">
              {health?.provider ?? "Google Gemini (free tier)"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Model</dt>
            <dd className="font-medium text-slate-800">
              {health?.model ?? "gemini-3.8-flash"}
            </dd>
          </div>
        </dl>

        {/* Configure the key right here */}
        <div className="mt-5 rounded-xl bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">
            Add your free AI key
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Get a free key at{" "}
            <span className="font-medium">aistudio.google.com</span> → “Get API
            key”, then paste it here. It's stored only on this device and used
            only to draft your reports.
          </p>
          {savedKey ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700">
                Key saved on this device ····{savedKey.slice(-4)}
                {deviceWorking ? " · verified ✓" : ""}
              </span>
              <Btn variant="ghost" onClick={removeKey}>
                Remove
              </Btn>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                type="password"
                autoComplete="off"
                className={`${inputCls} min-w-[240px] flex-1`}
                placeholder="Paste your Google AI Studio key"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                aria-label="Google AI Studio API key"
              />
              <Btn onClick={saveKey} disabled={checking || !keyInput.trim()}>
                {checking ? "Verifying…" : "Save & verify"}
              </Btn>
            </div>
          )}
          {keyMsg && (
            <p className="mt-2 text-sm text-slate-600">{keyMsg}</p>
          )}
          <p className="mt-3 text-xs text-slate-400">
            Running this for a whole team? Add the same key once as{" "}
            <code className="rounded bg-white px-1 py-0.5">AI_API_KEY</code>{" "}
            in the Vercel project env vars instead — then every device is
            covered and no one pastes anything.
          </p>
          <Btn
            variant="ghost"
            className="mt-2"
            onClick={check}
            disabled={checking}
          >
            {checking ? "Checking…" : "↻ Re-check connection"}
          </Btn>
        </div>

        {/* AI ON/OFF */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">AI drafting</p>
            <p className="text-xs text-slate-500">
              {aiOn
                ? "On — “Draft with AI” buttons appear in walkthroughs and reports."
                : "Off — AI buttons are hidden everywhere. Template drafting still works."}
            </p>
          </div>
          <div
            role="group"
            aria-label="AI drafting on or off"
            className="flex rounded-xl border border-slate-200 bg-slate-100 p-1"
          >
            {([true, false] as const).map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setAiOn(v)}
                aria-pressed={aiOn === v}
                className={`flex min-h-[44px] items-center justify-center rounded-lg px-4 text-xs font-bold tracking-widest transition-all ${
                  aiOn === v
                    ? "bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {v ? "ON" : "OFF"}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Device storage</h2>
            <p className="mt-1 max-w-xl text-sm text-slate-500">
              Assessments and photo evidence live on this device until shared
              storage lands. Photos are the biggest consumer — when storage
              fills up, new photos stop saving, so keep an eye on the headroom
              before a site visit.
            </p>
            {corruptKeys.length > 0 && (
              <p className="mt-2 max-w-xl rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {corruptKeys.length} saved dataset{corruptKeys.length === 1 ? " was" : "s were"}{" "}
                unreadable and {corruptKeys.length === 1 ? "has" : "have"} been set
                aside (keys: {corruptKeys.join(", ")}). The original data is
                preserved on this device — contact support before clearing
                anything, and restore from a backup if you have one.
              </p>
            )}
          </div>
          {usage ? (
            <Badge
              tone={
                storageLevel(usage.fraction) === "critical"
                  ? "red"
                  : storageLevel(usage.fraction) === "warning"
                    ? "yellow"
                    : "green"
              }
            >
              {Math.round(usage.fraction * 100)}% used
              {usage.quotaIsEstimate ? " (est.)" : ""}
            </Badge>
          ) : (
            <Badge tone="gray">Checking…</Badge>
          )}
        </div>

        {usage && (
          <>
            <div
              className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuenow={Math.round(usage.fraction * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Device storage used"
            >
              <div
                className={`h-full rounded-full ${
                  storageLevel(usage.fraction) === "critical"
                    ? "bg-red-500"
                    : storageLevel(usage.fraction) === "warning"
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                }`}
                style={{
                  width: `${Math.min(100, Math.max(1, usage.fraction * 100))}%`,
                }}
              />
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-400">Used on this device</dt>
                <dd className="font-medium text-slate-800">
                  {formatBytes(usage.totalBytes)} of{" "}
                  {formatBytes(usage.quotaBytes)}
                  {usage.quotaIsEstimate ? " (typical limit)" : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Photo evidence</dt>
                <dd className="font-medium text-slate-800">
                  {formatBytes(usage.photosBytes)} ·{" "}
                  {Math.round(usage.photosShare * 100)}% of app data
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Largest stores</dt>
                <dd className="font-medium text-slate-800">
                  {usage.byKey
                    .slice(0, 3)
                    .map((k) => `${k.key.replace("sat_", "")} ${formatBytes(k.bytes)}`)
                    .join(" · ") || "Nothing stored yet"}
                </dd>
              </div>
            </dl>

            {storageLevel(usage.fraction) !== "ok" && (
              <p
                className={`mt-4 rounded-xl p-3 text-sm ${
                  storageLevel(usage.fraction) === "critical"
                    ? "bg-red-50 text-red-800"
                    : "bg-amber-50 text-amber-800"
                }`}
              >
                {storageLevel(usage.fraction) === "critical"
                  ? "Storage is almost full — new photos may fail to save. Export a backup (Reports & Exports → Backup & Restore), then clean up orphaned photos below or remove old data."
                  : "Storage is getting full. Consider exporting a backup (Reports & Exports → Backup & Restore) and cleaning up orphaned photos below before your next site visit."}
              </p>
            )}

            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-800">
                Orphaned photos
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {orphans.length === 0
                  ? "None — every stored photo is attached to a walkthrough response or finding."
                  : `${orphans.length} photo${orphans.length === 1 ? "" : "s"} (${formatBytes(photosByteSize(orphans))}) no longer attached to any response or finding — leftovers from deleted items. Deleting them frees space and changes nothing you can see in the app.`}
              </p>
              {orphans.length > 0 &&
                (confirmCleanup ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-700">
                      Delete {orphans.length} orphaned photo
                      {orphans.length === 1 ? "" : "s"}? This can&apos;t be
                      undone.
                    </span>
                    <Btn onClick={cleanupOrphans}>Yes, delete them</Btn>
                    <Btn
                      variant="ghost"
                      onClick={() => setConfirmCleanup(false)}
                    >
                      Keep them
                    </Btn>
                  </div>
                ) : (
                  <Btn
                    className="mt-3"
                    variant="ghost"
                    onClick={() => setConfirmCleanup(true)}
                  >
                    Clean up orphaned photos
                  </Btn>
                ))}
              {storageMsg && (
                <p className="mt-2 text-sm text-slate-600">{storageMsg}</p>
              )}
              <Btn variant="ghost" className="mt-2" onClick={loadStorage}>
                ↻ Re-check storage
              </Btn>
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-800">
                Stale equipment links
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {equipPlan === null
                  ? "Checking…"
                  : equipPlan.staleCount === 0
                    ? "None — every equipment item is either unlinked or attached to a live finding."
                    : `${equipPlan.staleCount} equipment item${equipPlan.staleCount === 1 ? "" : "s"} still point${equipPlan.staleCount === 1 ? "s" : ""} at a finding that no longer exists — leftovers from before equipment tracking was made re-derivation-safe. Cleanup removes only provable duplicates (${equipPlan.deleteIds.length}); every other item is kept and simply unlinked, so it still appears in reports under unlinked equipment. Manually added items are never deleted.`}
              </p>
              {equipPlan !== null &&
                equipPlan.staleCount > 0 &&
                (confirmEquipCleanup ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-700">
                      Remove {equipPlan.deleteIds.length} duplicate
                      {equipPlan.deleteIds.length === 1 ? "" : "s"} and unlink{" "}
                      {equipPlan.unlinkIds.length} kept item
                      {equipPlan.unlinkIds.length === 1 ? "" : "s"}? This
                      can&apos;t be undone.
                    </span>
                    <Btn onClick={cleanupEquipment}>Yes, clean up</Btn>
                    <Btn
                      variant="ghost"
                      onClick={() => setConfirmEquipCleanup(false)}
                    >
                      Keep them
                    </Btn>
                  </div>
                ) : (
                  <Btn
                    className="mt-3"
                    variant="ghost"
                    onClick={() => setConfirmEquipCleanup(true)}
                  >
                    Clean up stale equipment links
                  </Btn>
                ))}
              {equipMsg && (
                <p className="mt-2 text-sm text-slate-600">{equipMsg}</p>
              )}
            </div>
          </>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">Code Red Hub</h2>
        <p className="mt-1 text-sm text-slate-500">
          Work started here can move into the Code Red Hub — use{" "}
          <span className="font-medium">
            Reports &amp; Exports → Export for Code Red Hub
          </span>{" "}
          to download the exchange package.
        </p>
      </Card>
    </div>
  );
}
