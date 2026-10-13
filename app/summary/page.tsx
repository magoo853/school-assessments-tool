/**
 * Printable operations summary: stat cards, charts, top findings,
 * upcoming visits, and reassessments due on one print-optimized page.
 * The Shell chrome (sidebar/header) hides in print via `print:hidden`.
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { db, type Finding, type ScheduleItem } from "@/lib/store";
import { useMode } from "@/lib/mode";
import {
  getDashboardStats,
  getReassessment,
  type ReassessInfo,
  type DashboardStats,
} from "@/lib/data";
import {
  summarizeCa,
  overdueFindings,
  type CaSummary,
} from "@/lib/ca";
import { Card, PageHeader, Badge, RiskBadge, StatusPill } from "@/components/ui";
import { FindingsRiskChart, AssessmentStatusDonut } from "@/components/DashboardCharts";

const RISK_ORDER: Record<string, number> = { high: 0, moderate: 1, low: 2 };

interface Snapshot {
  stats: DashboardStats;
  upcoming: { schedule: ScheduleItem; assessorName?: string }[];
  reassess: ReassessInfo[];
  topFindings: Finding[];
  ca: CaSummary;
  overdue: { finding: Finding; clientName: string }[];
  riskCounts: Record<string, number>;
  statusCounts: Record<string, number>;
}

function loadSnapshot(): Snapshot {
  const upcoming = db.schedules
    .filter((s) => s.status === "scheduled" || s.status === "in_progress")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((schedule) => ({
      schedule,
      assessorName: schedule.assessorId
        ? db.assessors.get(schedule.assessorId)?.name
        : undefined,
    }));
  const clients = Array.from(
    new Set([
      ...db.assessments.list().map((a) => a.clientName),
      ...db.schedules.list().map((s) => s.clientName),
    ])
  );
  const reassess = clients
    .map((c) => getReassessment(c))
    .filter((r) => r.state === "overdue" || r.state === "due-soon");
  const topFindings = db.findings
    .list()
    .sort((a, b) => (RISK_ORDER[a.risk] ?? 3) - (RISK_ORDER[b.risk] ?? 3))
    .slice(0, 10);
  const riskCounts: Record<string, number> = { high: 0, moderate: 0, low: 0 };
  for (const f of db.findings.list()) if (f.risk in riskCounts) riskCounts[f.risk] += 1;
  const statusCounts: Record<string, number> = { draft: 0, in_progress: 0, completed: 0 };
  for (const a of db.assessments.list()) if (a.status in statusCounts) statusCounts[a.status] += 1;
  const allFindings = db.findings.list();
  const ca = summarizeCa(allFindings);
  const overdue = overdueFindings(allFindings)
    .slice(0, 8)
    .map((finding) => ({
      finding,
      clientName: db.assessments.get(finding.assessmentId)?.clientName ?? "—",
    }));
  return {
    stats: getDashboardStats(),
    upcoming,
    reassess,
    topFindings,
    ca,
    overdue,
    riskCounts,
    statusCounts,
  };
}

function todayStr(): string {
  return new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function SummaryPage() {
  const [mode] = useMode();
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    setSnap(loadSnapshot());
  }, [mode]);

  const s = snap?.stats;

  return (
    <div className="space-y-6 print:space-y-4">
      <PageHeader
        title="Operations summary"
        subtitle={`School Assessments Tool · ${todayStr()} · ${mode === "demo" ? "DEMO data" : "PROD data"}`}
        actions={
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-violet-300 hover:text-violet-700 print:hidden"
          >
            🖨 Print
          </button>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Scheduled", value: s?.scheduled ?? 0 },
          { label: "In progress", value: s?.inProgress ?? 0 },
          { label: "Completed", value: s?.completed ?? 0 },
          { label: "High-risk findings", value: s?.highRiskFindings ?? 0 },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-slate-200 bg-white p-4"
          >
            <p className="text-3xl font-bold text-slate-900">{c.value}</p>
            <p className="mt-1 text-sm text-slate-500">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2 print:break-inside-avoid">
        <Card>
          <h2 className="mb-4 font-semibold text-slate-900">Findings by risk</h2>
          <FindingsRiskChart counts={snap?.riskCounts ?? {}} />
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold text-slate-900">Assessment pipeline</h2>
          <AssessmentStatusDonut counts={snap?.statusCounts ?? {}} />
        </Card>
      </div>

      {/* Corrective actions */}
      <Card className="print:break-inside-avoid">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Corrective actions</h2>
          <Link
            href="/findings?ca=overdue"
            className="text-sm font-medium text-violet-700 hover:underline print:hidden"
          >
            Overdue actions →
          </Link>
        </div>
        {snap && snap.ca.total > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                { label: "Open", value: snap.ca.open },
                { label: "In progress", value: snap.ca.inProgress },
                { label: "Corrected / verified", value: snap.ca.corrected + snap.ca.verified },
                { label: "⚠ Overdue", value: snap.ca.overdue },
              ].map((c) => (
                <div
                  key={c.label}
                  className={`rounded-2xl border p-4 ${
                    c.label === "⚠ Overdue" && c.value > 0
                      ? "border-rose-200 bg-rose-50/60"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <p
                    className={`text-3xl font-bold ${
                      c.label === "⚠ Overdue" && c.value > 0
                        ? "text-rose-700"
                        : "text-slate-900"
                    }`}
                  >
                    {c.value}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{c.label}</p>
                </div>
              ))}
            </div>
            {snap.overdue.length > 0 ? (
              <ul className="mt-4 divide-y divide-slate-100">
                {snap.overdue.map(({ finding: f, clientName }) => (
                  <li
                    key={f.id}
                    className="flex items-start justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {f.gapText}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {clientName}
                        {f.caDueDate ? ` · due ${f.caDueDate}` : ""}
                        {f.caOwner ? ` · ${f.caOwner}` : ""}
                      </p>
                    </div>
                    <Badge tone="red">⚠ Overdue</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                No overdue corrective actions.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">
            No corrective actions recorded.
          </p>
        )}
      </Card>

      {/* Top findings */}
      <Card className="print:break-inside-avoid">
        <h2 className="mb-3 font-semibold text-slate-900">Top findings</h2>
        {snap && snap.topFindings.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {snap.topFindings.map((f) => {
              const a = db.assessments.get(f.assessmentId);
              return (
                <li key={f.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{f.gapText}</p>
                    {a && (
                      <p className="mt-0.5 text-xs text-slate-500">{a.clientName}</p>
                    )}
                  </div>
                  <RiskBadge risk={f.risk} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No findings recorded.</p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Upcoming visits */}
        <Card className="print:break-inside-avoid">
          <h2 className="mb-3 font-semibold text-slate-900">Upcoming visits</h2>
          {snap && snap.upcoming.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {snap.upcoming.slice(0, 8).map(({ schedule, assessorName }) => (
                <li key={schedule.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {schedule.clientName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {schedule.date}
                      {schedule.campus ? ` · ${schedule.campus}` : ""}
                      {assessorName ? ` · ${assessorName}` : ""}
                    </p>
                  </div>
                  <StatusPill status={schedule.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No upcoming visits.</p>
          )}
        </Card>

        {/* Reassessments due */}
        <Card className="print:break-inside-avoid">
          <h2 className="mb-3 font-semibold text-slate-900">Reassessments due</h2>
          {snap && snap.reassess.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {snap.reassess.map((r) => (
                <li key={r.clientName} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {r.clientName}
                    </p>
                    <p className="text-xs text-slate-500">
                      Last assessed {r.lastDate ?? "—"} · due {r.dueDate ?? "—"}
                    </p>
                  </div>
                  {r.state === "overdue" ? (
                    <Badge tone="red">Overdue</Badge>
                  ) : (
                    <Badge tone="yellow">Due soon</Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Nothing due.</p>
          )}
        </Card>
      </div>

      <p className="hidden text-center text-xs text-slate-400 print:block">
        Generated by the School Assessments Tool · {todayStr()}
      </p>
      <p className="text-center print:hidden">
        <Link href="/" className="text-sm font-medium text-violet-700 hover:underline">
          ← Back to dashboard
        </Link>
      </p>
    </div>
  );
}
