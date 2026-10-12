/**
 * Client score history: pick a client, see their completed assessments
 * as a timeline with a transparent safety score and an SVG trend line.
 *
 * Score formula (shown on the page so it stays auditable):
 *   100 − 10 per high-risk finding − 5 per moderate − 2 per low, floor 0.
 */
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { db, type Assessment } from "@/lib/store";
import { resolveTemplate } from "@/lib/customTemplates";
import { useMode } from "@/lib/mode";
import { safetyScore } from "@/lib/data";
import {
  Card,
  PageHeader,
  Badge,
  EmptyState,
  inputCls,
} from "@/components/ui";
import ProdNotice from "@/components/ProdNotice";

interface TimelineEntry {
  assessment: Assessment;
  date: string;
  templateName: string;
  score: number;
  high: number;
  moderate: number;
  low: number;
}

function scoreColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#f59e0b";
  return "#f43f5e";
}

function ScoreTrend({ entries }: { entries: TimelineEntry[] }) {
  const W = 640;
  const H = 200;
  const PAD = 36;
  if (entries.length === 0) return null;
  const xs = (i: number) =>
    entries.length === 1
      ? W / 2
      : PAD + (i * (W - PAD * 2)) / (entries.length - 1);
  const ys = (s: number) => H - PAD - (s / 100) * (H - PAD * 2);
  const pts = entries.map((e, i) => `${xs(i).toFixed(1)},${ys(e.score).toFixed(1)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label="Safety score trend"
    >
      {/* gridlines */}
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line
            x1={PAD}
            x2={W - PAD}
            y1={ys(g)}
            y2={ys(g)}
            stroke="#e2e8f0"
            strokeWidth="1"
          />
          <text x={PAD - 8} y={ys(g) + 4} textAnchor="end" fontSize="11" fill="#94a3b8">
            {g}
          </text>
        </g>
      ))}
      {entries.length > 1 && (
        <polyline
          points={pts}
          fill="none"
          stroke="#8b5cf6"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {entries.map((e, i) => (
        <g key={e.assessment.id}>
          <circle
            cx={xs(i)}
            cy={ys(e.score)}
            r="7"
            fill={scoreColor(e.score)}
            stroke="#fff"
            strokeWidth="2.5"
          />
          <text
            x={xs(i)}
            y={ys(e.score) - 14}
            textAnchor="middle"
            fontSize="12"
            fontWeight="700"
            fill="#0f172a"
          >
            {e.score}
          </text>
          <text
            x={xs(i)}
            y={H - 10}
            textAnchor="middle"
            fontSize="11"
            fill="#64748b"
          >
            {e.date.slice(5)}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function ClientsPage() {
  return (
    <Suspense>
      <ClientsInner />
    </Suspense>
  );
}

function ClientsInner() {
  const [mode] = useMode();
  const [tick, setTick] = useState(0);
  const searchParams = useSearchParams();
  const initialClient = searchParams.get("client");
  const [client, setClient] = useState(initialClient ?? "all");

  useEffect(() => {
    setTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const clients = useMemo(() => {
    void tick;
    const names = new Set<string>();
    for (const a of db.assessments.list()) names.add(a.clientName);
    for (const s of db.schedules.list()) names.add(s.clientName);
    return Array.from(names).sort();
  }, [tick]);

  const entries: TimelineEntry[] = useMemo(() => {
    void tick;
    if (client === "all") return [];
    return db.assessments
      .filter((a) => a.clientName === client && a.status === "completed")
      .map((a) => {
        const s = safetyScore(a.id);
        return {
          assessment: a,
          date: (a.completedAt ?? a.createdAt).slice(0, 10),
          templateName: resolveTemplate(a.templateId).name,
          score: s.score,
          high: s.high,
          moderate: s.moderate,
          low: s.low,
        };
      })
      .sort((x, y) => x.date.localeCompare(y.date));
  }, [client, tick]);

  const latest = entries[entries.length - 1];
  const delta =
    entries.length > 1 ? latest.score - entries[entries.length - 2].score : null;

  return (
    <div>
      <PageHeader
        title="Client history"
        subtitle="Pick a client to see their assessment timeline and safety-score trend."
      />
      {mode === "prod" && <ProdNotice />}

      <div className="mb-4 max-w-md">
        <select
          value={client}
          onChange={(e) => setClient(e.target.value)}
          aria-label="Select client"
          className={inputCls}
        >
          <option value="all">Select a client…</option>
          {clients.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {client === "all" ? (
        <EmptyState
          title="No client selected"
          body="Choose a client above to see their completed assessments and score trend."
        />
      ) : entries.length === 0 ? (
        <EmptyState
          title="No completed assessments"
          body={`${client} has no completed assessments yet — the timeline appears after the first walkthrough is completed.`}
        />
      ) : (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{client}</h2>
                <p className="text-sm text-slate-500">
                  {entries.length} completed assessment{entries.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="text-right">
                <p
                  className="text-3xl font-bold"
                  style={{ color: scoreColor(latest.score) }}
                >
                  {latest.score}
                </p>
                <p className="text-xs text-slate-500">
                  latest score
                  {delta !== null && (
                    <span
                      className={delta >= 0 ? "text-emerald-600" : "text-rose-600"}
                    >
                      {" "}
                      ({delta >= 0 ? "+" : ""}
                      {delta} vs prior)
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <ScoreTrend entries={entries} />
            </div>
            <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
              <span className="font-semibold text-slate-700">Score formula:</span>{" "}
              100 − 10 per high-risk finding − 5 per moderate − 2 per low,
              floored at 0. Findings come straight from each assessment's
              checkpoint answers, so the number is fully auditable.
            </p>
          </Card>

          <Card className="!p-2 md:!p-3">
            <ul className="divide-y divide-slate-100">
              {[...entries].reverse().map((e) => (
                <li key={e.assessment.id}>
                  <Link
                    href={`/assessments/${e.assessment.id}`}
                    className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-violet-50/60 md:px-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {e.date} · {e.templateName}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {e.high} high · {e.moderate} moderate · {e.low} low
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className="text-xl font-bold"
                        style={{ color: scoreColor(e.score) }}
                      >
                        {e.score}
                      </span>
                      <Badge tone={e.score >= 80 ? "green" : e.score >= 60 ? "yellow" : "red"}>
                        {e.score >= 80 ? "Strong" : e.score >= 60 ? "Fair" : "At risk"}
                      </Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
