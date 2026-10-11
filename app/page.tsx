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
import ProdNotice from "@/components/ProdNotice";

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
  return {
    stats,
    upcoming,
    reassess,
    topFindings,
    assessorCount: db.assessors.list().length,
    cleryCount: db.cleryReports.list().length,
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
      className="block min-h-[44px] rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow"
    >
      <p className="text-3xl font-bold">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{label}</p>
    </Link>
  );
}

export default function DashboardPage() {
  const [mode] = useMode();
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    setSnap(loadSnapshot());
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Assessment pipeline, upcoming visits, and findings at a glance."
      />

      {isProd && <ProdNotice />}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Scheduled" value={s?.scheduled ?? 0} href="/schedule" />
        <StatCard label="In progress" value={s?.inProgress ?? 0} href="/assessments" />
        <StatCard label="Completed" value={s?.completed ?? 0} href="/reports" />
        <StatCard
          label="High-risk findings"
          value={s?.highRiskFindings ?? 0}
          href="/reports"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Upcoming assessments */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Upcoming assessments</h2>
            <Link
              href="/schedule"
              className="flex min-h-[44px] items-center text-sm font-medium text-blue-700 hover:underline"
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
              {snap.upcoming.map(({ schedule, assessorName }) => (
                <li key={schedule.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {schedule.clientName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {schedule.date}
                      {schedule.campus ? ` · ${schedule.campus}` : ""}
                      {assessorName ? ` · ${assessorName}` : ""}
                    </p>
                  </div>
                  <StatusPill status={schedule.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Reassessments due */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Reassessments due</h2>
            <Link
              href="/schedule"
              className="flex min-h-[44px] items-center text-sm font-medium text-blue-700 hover:underline"
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
                <li key={r.clientName} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.clientName}</p>
                    <p className="text-xs text-gray-500">
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
          )}
        </Card>
      </div>

      {/* Top findings */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Top findings</h2>
          <Link
            href="/reports"
            className="flex min-h-[44px] items-center text-sm font-medium text-blue-700 hover:underline"
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
                <li key={f.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{f.gapText}</p>
                    {assessment && (
                      <p className="mt-0.5 text-xs text-gray-500">
                        {assessment.clientName}
                      </p>
                    )}
                  </div>
                  <RiskBadge risk={f.risk} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
