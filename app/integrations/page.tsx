/**
 * Integrations — external connections and their status.
 * First integration: AI drafting via Google Gemini's free tier
 * (OpenAI-compatible endpoint). The API key lives server-side in the
 * Vercel env var AI_API_KEY — it never reaches the browser. Users can
 * turn AI drafting off per device; template drafting always works.
 */
"use client";

import { useEffect, useState } from "react";
import { Card, PageHeader, Badge, Btn } from "@/components/ui";
import { useAiEnabled } from "@/lib/aiSettings";

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

  const check = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/ai-health");
      setHealth((await res.json()) as Health);
    } catch {
      setHealth(null);
    }
    setChecking(false);
  };

  useEffect(() => {
    void check();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrations"
        subtitle="Connected services and how they're set up."
      />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              ✨ AI drafting
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-500">
              Drafts findings, AAR sections, and recommendations from your
              recorded assessment data. Every draft stays fully editable —
              the AI writes a first pass, you make the call.
            </p>
          </div>
          {health ? (
            health.working ? (
              <Badge tone="green">Connected</Badge>
            ) : health.configured ? (
              <Badge tone="red">Key added — not connecting</Badge>
            ) : (
              <Badge tone="gray">Not configured</Badge>
            )
          ) : (
            <Badge tone="gray">Checking…</Badge>
          )}
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

        {/* Setup instructions */}
        <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Add the free AI key</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              Get a free key at{" "}
              <span className="font-medium">Google AI Studio</span>{" "}
              (aistudio.google.com → “Get API key”).
            </li>
            <li>
              In Vercel → <span className="font-medium">school-assessments-tool</span>{" "}
              → Settings → Environment Variables, add{" "}
              <code className="rounded bg-white px-1.5 py-0.5 text-[13px]">
                AI_API_KEY
              </code>{" "}
              with that key.
            </li>
            <li>Redeploy — drafting turns on automatically.</li>
          </ol>
          <p className="mt-2 text-xs text-slate-400">
            The key stays server-side; it is never sent to the browser. No key?
            Template-based drafting still works everywhere.
          </p>
          <Btn variant="ghost" className="mt-3" onClick={check} disabled={checking}>
            {checking ? "Checking…" : "↻ Re-check connection"}
          </Btn>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold text-slate-900">Code Red Hub</h2>
        <p className="mt-1 text-sm text-slate-500">
          Work started here can move into the Code Red Hub — use{" "}
          <span className="font-medium">Reports &amp; Exports → Export for Code Red Hub</span>{" "}
          to download the exchange package.
        </p>
      </Card>
    </div>
  );
}
