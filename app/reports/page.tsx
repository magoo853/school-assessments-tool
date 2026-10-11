"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { db, type Assessment, type ReportDoc, type ReportKind } from "@/lib/store";
import { useMode } from "@/lib/mode";
import {
  Btn,
  Badge,
  Card,
  EmptyState,
  PageHeader,
  StatusPill,
} from "@/components/ui";
import ProdNotice from "@/components/ProdNotice";
import {
  REPORT_LABELS,
  assessmentsCsv,
  buildAarMarkdown,
  buildFindingsMarkdown,
  buildRecommendationsMarkdown,
  download,
  equipmentCsv,
  findingsCsv,
  responsesCsv,
  upsertReport,
} from "@/lib/reports";
import { getTemplate } from "@/lib/templates";
import { deriveFindings } from "@/lib/findings";

const KIND_ICONS: Record<ReportKind, string> = {
  aar: "📋",
  findings: "🔎",
  recommendations: "✅",
};

const KIND_DESCS: Record<ReportKind, string> = {
  aar: "Full after-action report: cover, TOC, strengths, vulnerabilities, recommendations, certification, and corrective action plan.",
  findings: "One section per finding with gap statement, risk, assessor note, and checkpoint reference.",
  recommendations: "Prioritized recommendations plus equipment needs grouped by priority.",
};

function fmtUpdated(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function ReportsPage() {
  const [mode] = useMode();
  const [tick, setTick] = useState(0);

  const assessments = useMemo<Assessment[]>(() => {
    if (mode === "prod") return [];
    return [...db.assessments.list()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }, [mode, tick]);

  const reportsByKey = useMemo(() => {
    const m = new Map<string, ReportDoc>();
    for (const r of db.reports.list()) m.set(`${r.assessmentId}:${r.kind}`, r);
    return m;
  }, [mode, tick]);

  useEffect(() => {
    // Refresh in case another slice changed data while this page was mounted.
    setTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = (a: Assessment, kind: ReportKind) => {
    const findings = deriveFindings(a.id);
    const refreshed = db.findings.filter((f) => f.assessmentId === a.id);
    const responses = db.responses.filter((r) => r.assessmentId === a.id);
    const equipment = db.equipment.filter((e) => e.assessmentId === a.id);
    const template = getTemplate(a.templateId);

    const markdown =
      kind === "aar"
        ? buildAarMarkdown(a, responses, refreshed, equipment, template)
        : kind === "findings"
          ? buildFindingsMarkdown(a, refreshed, template)
          : buildRecommendationsMarkdown(a, refreshed, equipment, template);

    upsertReport(
      a.id,
      kind,
      markdown,
      `${REPORT_LABELS[kind]} — ${a.clientName}`
    );
    setTick((t) => t + 1);
  };

  const exportAll = (
    filename: string,
    csv: string
  ) => download(filename, csv, "text/csv;charset=utf-8");

  if (mode === "prod") {
    return (
      <div>
        <PageHeader title="Reports & Exports" />
        <ProdNotice />
        <EmptyState
          title="No reports in prod yet"
          body="The live database is not connected. Switch to demo mode to generate reports from sample data."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Exports"
        subtitle="Generate editable reports from completed walkthroughs, or export raw data as CSV."
      />

      {/* Per-assessment report cards */}
      {assessments.length === 0 ? (
        <EmptyState
          title="No assessments yet"
          body="Reports are generated per assessment. Complete a walkthrough first, then generate its reports here."
        />
      ) : (
        assessments.map((a) => (
          <Card key={a.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">
                  {a.clientName}{" "}
                  <span className="font-normal text-gray-500">— {a.campus}</span>
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Assessment date: {a.cover?.date || a.createdAt.slice(0, 10)}
                </p>
              </div>
              <StatusPill status={a.status} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {(Object.keys(REPORT_LABELS) as ReportKind[]).map((kind) => {
                const doc = reportsByKey.get(`${a.id}:${kind}`);
                return (
                  <div
                    key={kind}
                    className="flex flex-col rounded-lg border border-gray-200 p-3"
                  >
                    <p className="font-semibold">
                      <span aria-hidden className="mr-1.5">
                        {KIND_ICONS[kind]}
                      </span>
                      {REPORT_LABELS[kind]}
                    </p>
                    <p className="mt-1 flex-1 text-xs text-gray-500">
                      {KIND_DESCS[kind]}
                    </p>
                    <div className="mt-2">
                      {doc ? (
                        <Badge tone="green">
                          Generated · {fmtUpdated(doc.updatedAt)}
                        </Badge>
                      ) : (
                        <Badge tone="gray">Not generated</Badge>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Btn
                        variant="primary"
                        className="min-h-[44px] flex-1"
                        onClick={() => generate(a, kind)}
                      >
                        {doc ? "Regenerate" : "Generate"}
                      </Btn>
                      {doc && (
                        <Link
                          href={`/reports/${doc.id}`}
                          className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Open
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))
      )}

      {/* Clery builder link (owned by another slice) */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Clery Act ASR Builder</h2>
            <p className="mt-1 text-sm text-gray-500">
              Build the Annual Security Report: 3 years of crime statistics by
              geography plus the required policy disclosure statements.
            </p>
          </div>
          <Link
            href="/reports/clery"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Open Clery builder →
          </Link>
        </div>
      </Card>

      {/* CSV exports */}
      <Card>
        <h2 className="font-semibold">CSV Exports</h2>
        <p className="mt-1 text-sm text-gray-500">
          Raw data exports for spreadsheets. Gap statements export as recorded
          — negative gap wording, never criterion text.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Btn
            variant="ghost"
            className="justify-start"
            onClick={() =>
              exportAll(
                "findings.csv",
                findingsCsv(db.findings.list(), null)
              )
            }
          >
            📥 Findings CSV
          </Btn>
          <Btn
            variant="ghost"
            className="justify-start"
            onClick={() =>
              exportAll("responses.csv", responsesCsv(db.responses.list()))
            }
          >
            📥 Responses CSV
          </Btn>
          <Btn
            variant="ghost"
            className="justify-start"
            onClick={() =>
              exportAll("equipment.csv", equipmentCsv(db.equipment.list()))
            }
          >
            📥 Equipment CSV
          </Btn>
          <Btn
            variant="ghost"
            className="justify-start"
            onClick={() =>
              exportAll(
                "assessments.csv",
                assessmentsCsv(db.assessments.list())
              )
            }
          >
            📥 Assessments CSV
          </Btn>
        </div>
      </Card>
    </div>
  );
}
