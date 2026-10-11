"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/store";
import type { Finding, ScheduleItem } from "@/lib/store";
import { useMode, onModeChange } from "@/lib/mode";
import {
  getDashboardStats,
  getReassessment,
  type ReassessInfo,
} from "@/lib/data";
import { Card, PageHeader, Badge, RiskBadge, StatusPill, EmptyState } from "@/components/ui";
import { FindingsRiskChart, AssessmentStatusDonut } from "@/components/DashboardCharts";
import ProdNotice from "@/components/ProdNotice";

const ONBOARD_DISMISS_KEY = "sat_onboard_dismissed";

const ONBOARD_STEPS = [
  {
    n: 1,
    title: "Add your assessor profile",
    body: "Photo, contact info, and clearance credentials — schools see this before a visit.",
    href: "/assessors",
    icon: "👥",
  },
  {
    n: 2,
    title: "Schedule a visit",
    body: "Pick a client, date, template, and assessor. One tap starts the walkthrough on site.",
    href: "/schedule",
    icon: "🗓️",
  },
  {
    n: 3,
    title: "Run a walkthrough",
    body: "Answer checkpoints, dictate notes, capture photo evidence — findings build themselves.",
    href: "/assessments",
    icon: "📋",
  },
  {
    n: 4,
    title: "Generate the client report",
    body: "AAR, Findings, and Recommendations — editable, printable, and shareable as one HTML file.",
    href: "/reports",
    icon: "📄",
  },
];

/** First-run checklist — only when the workspace is completely empty. */
function OnboardingCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Card className="!border-violet-200 bg-gradient-to-b from-violet-50/70 to-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">
            Get started
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Four steps from empty workspace to your first client report.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-400 hover:bg-white hover:text-slate-600"
          aria-label="Dismiss getting started"
        >
          ✕
        </button>
      </div>
      <ol className="mt-4 space-y-2">
        {ONBOARD_STEPS.map((s) => (
          <li key={s.n}>
            <Link
              href={s.href}
              className="group flex min-h-[44px] items-center gap-3 rounded-xl border border-slate-200/70 bg-white px-4 py-3 transition-all hover:border-violet-300 hover:shadow-[0_8px_24px_-12px_rgba(109,40,217,0.25)]"
            >
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-lg text-white"
              >
                {s.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">
                  <span className="mr-1.5 text-xs font-bold text-violet-500">
                    {s.n}
                  </span>
                  {s.title}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {s.body}
                </span>
              </span>
              <span aria-hidden className="text-violet-400 transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}

const RISK_ORDER: Record<string, number> = { high: 0, moderate: 1, low: 2 };

interface UpcomingRow {
  schedule: ScheduleItem;
  assessorName?: string;
}

interface Snapshot {
  stats: ReturnType<typeof getDashboardStats>;
  upcoming: UpcomingRow[];
  reassess: ReassessInfo[];
  topFindings: Finding[];
  assessorCount: number;
  cleryCount: number;
  riskCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  assessmentCount: number;
  scheduleCount: number;
}

function loadSnapshot(): Snapshot {
  const stats = getDashboardStats();
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
    ]),
  );
  const reassess = clients
    .map((clientName) => getReassessment(clientName))
    .filter((r) => r.state === "overdue" || r.state === "due-soon");
  const topFindings = db.findings
    .list()
    .sort(
      (a, b) =>
        (RISK_ORDER[a.risk] ?? 3) - (RISK_ORDER[b.risk] ?? 3),
    )
    .slice(0, 5);
  const riskCounts: Record<string, number> = { high: 0, moderate: 0, low: 0 };
  for (const f of db.findings.list()) {
    if (f.risk in riskCounts) riskCounts[f.risk] += 1;
  }
  const statusCounts: Record<string, number> = { draft: 0, in_progress: 0, completed: 0 };
  for (const a of db.assessments.list()) {
    if (a.status in statusCounts) statusCounts[a.status] += 1;
  }
  return {
    stats,
    upcoming,
    reassess,
    topFindings,
    assessorCount: db.assessors.list().length,
    cleryCount: db.cleryReports.list().length,
    riskCounts,
    statusCounts,
    assessmentCount: db.assessments.list().length,
    scheduleCount: db.schedules.list().length,
  };
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group block min-h-[44px] rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_12px_32px_-16px_rgba(109,40,217,0.18)] transition-all hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-[0_16px_40px_-16px_rgba(109,40,217,0.35)]"
    >
      <p className="text-3xl font-bold tracking-tight text-slate-900 group-hover:text-violet-700">
        {value}
      </p>
      <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
        {label}
        <span aria-hidden className="text-violet-400 opacity-0 transition-opacity group-hover:opacity-100">→</span>
      </p>
    </Link>
  );
}

export default function DashboardPage() {
  const [mode] = useMode();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [onboardDismissed, setOnboardDismissed] = useState(false);

  useEffect(() => {
    setSnap(loadSnapshot());
    try {
      setOnboardDismissed(
        window.localStorage.getItem(ONBOARD_DISMISS_KEY) === "1"
      );
    } catch {
      /* ignore */
    }
  }, [mode]);

  // Re-load after mode switches (Shell seeds/clears data on the same event;
  // defer a tick so its handler runs first).
  useEffect(() => {
    return onModeChange(() => {
      setTimeout(() => setSnap(loadSnapshot()), 0);
    });
  }, []);

  const s = snap?.stats;
  const isProd = mode === "prod";
  const showOnboarding =
    !onboardDismissed &&
    snap !== null &&
    snap.assessmentCount === 0 &&
    snap.scheduleCount === 0 &&
    snap.assessorCount === 0;

  const dismissOnboarding = () => {
    setOnboardDismissed(true);
    try {
      window.localStorage.setItem(ONBOARD_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Assessment pipeline, upcoming visits, and findings at a glance."
        actions={
          <Link
            href="/summary"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-violet-300 hover:text-violet-700"
          >
            🖨 Print summary
          </Link>
        }
      />

      {isProd && <ProdNotice />}

      {showOnboarding && <OnboardingCard onDismiss={dismissOnboarding} />}

      {/* Stat cards — every number drills down */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Scheduled" value={s?.scheduled ?? 0} href="/schedule" />
        <StatCard
          label="In progress"
          value={s?.inProgress ?? 0}
          href="/assessments?status=in_progress"
        />
        <StatCard
          label="Completed"
          value={s?.completed ?? 0}
          href="/assessments?status=completed"
        />
        <StatCard
          label="High-risk findings"
          value={s?.highRiskFindings ?? 0}
          href="/findings?risk=high"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Findings by risk</h2>
            <Link
              href="/findings"
              className="flex min-h-[44px] items-center text-sm font-medium text-violet-700 hover:underline"
            >
              All findings →
            </Link>
          </div>
          <FindingsRiskChart counts={snap?.riskCounts ?? {}} />
        </Card>
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Assessment pipeline</h2>
            <Link
              href="/assessments"
              className="flex min-h-[44px] items-center text-sm font-medium text-violet-700 hover:underline"
            >
              All assessments →
            </Link>
          </div>
          <AssessmentStatusDonut counts={snap?.statusCounts ?? {}} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Upcoming assessments */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Upcoming assessments</h2>
            <Link
              href="/schedule"
              className="flex min-h-[44px] items-center text-sm font-medium text-violet-700 hover:underline"
            >
              Schedule →
            </Link>
          </div>
          {!snap || snap.upcoming.length === 0 ? (
            <EmptyState
              title="No upcoming assessments"
              body={
                isProd
                  ? "Tables are empty in PROD mode — switch to DEMO to see sample data."
                  : "Schedule a visit to see it here."
              }
            />
          ) : (
            <ul className="divide-y divide-gray-100">
              {snap.upcoming.map(({ schedule, assessorName }) => {
                const href = schedule.assessmentId
                  ? `/assessments/${schedule.assessmentId}`
                  : "/schedule";
                return (
                  <li key={schedule.id}>
                    <Link
                      href={href}
                      className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg py-3 transition-colors hover:bg-violet-50/50"
                    >
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
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Reassessments due */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Reassessments due</h2>
            <Link
              href="/schedule"
              className="flex min-h-[44px] items-center text-sm font-medium text-violet-700 hover:underline"
            >
              View schedule →
            </Link>
          </div>
          {!snap || snap.reassess.length === 0 ? (
            <EmptyState
              title="Nothing due"
              body={
                isProd
                  ? "Tables are empty in PROD mode — switch to DEMO to see sample data."
                  : "Completed assessments get a 12-month reassessment clock automatically."
              }
            />
          ) : (
            <ul className="divide-y divide-gray-100">
              {snap.reassess.map((r) => (
                <li key={r.clientName}>
                  <Link
                    href="/schedule"
                    className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg py-3 transition-colors hover:bg-violet-50/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{r.clientName}</p>
                      <p className="text-xs text-slate-500">
                        Last assessed {r.lastDate ?? "—"} · due {r.dueDate ?? "—"}
                      </p>
                    </div>
                    {r.state === "overdue" ? (
                      <Badge tone="red">Overdue</Badge>
                    ) : (
                      <Badge tone="yellow">Due soon</Badge>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Top findings */}
      <Card>
        <div id="top-findings" className="mb-3 flex scroll-mt-24 items-center justify-between">
          <h2 className="font-semibold text-slate-900">Top findings</h2>
          <Link
            href="/reports"
            className="flex min-h-[44px] items-center text-sm font-medium text-violet-700 hover:underline"
          >
            All reports →
          </Link>
        </div>
        {!snap || snap.topFindings.length === 0 ? (
          <EmptyState
            title="No findings yet"
            body={
              isProd
                ? "Tables are empty in PROD mode — switch to DEMO to see sample data."
                : "Findings from completed assessments will surface here, ranked by risk."
            }
          />
        ) : (
          <ul className="divide-y divide-gray-100">
            {snap.topFindings.map((f) => {
              const assessment = db.assessments.get(f.assessmentId);
              return (
                <li key={f.id}>
                  <Link
                    href={`/assessments/${f.assessmentId}`}
                    className="flex min-h-[44px] items-start justify-between gap-3 rounded-lg py-3 transition-colors hover:bg-violet-50/50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{f.gapText}</p>
                      {assessment && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {assessment.clientName}
                        </p>
                      )}
                    </div>
                    <RiskBadge risk={f.risk} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
