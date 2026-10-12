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
  buildCombinedMarkdown,
  buildFindingsMarkdown,
  buildRecommendationsMarkdown,
  download,
  equipmentCsv,
  findingsCsv,
  groupReportKey,
  responsesCsv,
  upsertReport,
} from "@/lib/reports";
import { resolveTemplate } from "@/lib/customTemplates";
import { deriveFindings } from "@/lib/findings";
import {
  buildHubExchange,
  exchangeFilename,
  HUB_EXCHANGE_VERSION,
} from "@/lib/hubExport";

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
  const [hubScope, setHubScope] = useState<"completed" | "all">("completed");

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

  const buildFor = (a: Assessment, kind: ReportKind) => {
    deriveFindings(a.id);
    const findings = db.findings.filter((f) => f.assessmentId === a.id);
    const responses = db.responses.filter((r) => r.assessmentId === a.id);
    const equipment = db.equipment.filter((e) => e.assessmentId === a.id);
    const template = resolveTemplate(a.templateId);
    const fsl = db.fslRecords.filter((r) => r.assessmentId === a.id)[0] ?? null;

    const markdown =
      kind === "aar"
        ? buildAarMarkdown(a, responses, findings, equipment, template, fsl)
        : kind === "findings"
          ? buildFindingsMarkdown(a, findings, template)
          : buildRecommendationsMarkdown(a, findings, equipment, template);
    return { markdown, findings };
  };

  const generate = (a: Assessment, kind: ReportKind) => {
    const { markdown } = buildFor(a, kind);
    upsertReport(
      a.id,
      kind,
      markdown,
      `${REPORT_LABELS[kind]} — ${a.clientName}`
    );
    setTick((t) => t + 1);
  };

  /* -------- Selection-first generation -------- */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchKind, setBatchKind] = useState<ReportKind>("findings");
  const [notice, setNotice] = useState<string | null>(null);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedAssessments = assessments.filter((a) => selected.has(a.id));

  const generateSelected = () => {
    for (const a of selectedAssessments) {
      const { markdown } = buildFor(a, batchKind);
      upsertReport(
        a.id,
        batchKind,
        markdown,
        `${REPORT_LABELS[batchKind]} — ${a.clientName}`
      );
    }
    setNotice(
      `Generated ${REPORT_LABELS[batchKind]} for ${selectedAssessments.length} assessment${selectedAssessments.length === 1 ? "" : "s"}.`
    );
    setTick((t) => t + 1);
  };

  const generateCombined = () => {
    const parts = selectedAssessments.map((a) => {
      const { markdown, findings } = buildFor(a, batchKind);
      return { assessment: a, markdown, findings };
    });
    const combined = buildCombinedMarkdown(batchKind, parts);
    upsertReport(
      groupReportKey(selectedAssessments.map((a) => a.id)),
      batchKind,
      combined,
      `Combined ${REPORT_LABELS[batchKind]} — ${selectedAssessments.length} schools`
    );
    setNotice(
      `Combined ${REPORT_LABELS[batchKind]} generated for ${selectedAssessments.length} schools — see Combined reports below.`
    );
    setTick((t) => t + 1);
  };

  const groupDocs = useMemo(
    () =>
      db.reports
        .filter((r) => r.assessmentId.startsWith("group:"))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [mode, tick]
  );

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

      {/* Selection-first generation: pick one assessment or a group, then generate */}
      {assessments.length > 0 && (
        <div className="sticky top-16 z-20 -mx-4 bg-[#EEF1F8]/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Btn
              variant="ghost"
              onClick={() =>
                setSelected(
                  new Set(
                    assessments
                      .filter((a) => a.status === "completed")
                      .map((a) => a.id)
                  )
                )
              }
            >
              Select completed
            </Btn>
            <Btn
              variant="ghost"
              onClick={() => setSelected(new Set(assessments.map((a) => a.id)))}
            >
              Select all
            </Btn>
            {selected.size > 0 && (
              <Btn variant="ghost" onClick={() => setSelected(new Set())}>
                Clear
              </Btn>
            )}
            <span className="text-sm font-medium text-slate-600">
              {selected.size} selected
            </span>
          </div>
          {selected.size > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="flex gap-1 rounded-full border border-slate-200 bg-white p-1">
                {(Object.keys(REPORT_LABELS) as ReportKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setBatchKind(kind)}
                    aria-pressed={batchKind === kind}
                    className={`min-h-[44px] rounded-full px-3 text-sm font-semibold transition ${
                      batchKind === kind
                        ? "bg-gradient-to-r from-violet-500 to-indigo-500 text-white"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {KIND_ICONS[kind]} {REPORT_LABELS[kind]}
                  </button>
                ))}
              </div>
              <Btn onClick={generateSelected}>
                Generate {selected.size} report{selected.size === 1 ? "" : "s"}
              </Btn>
              {selected.size >= 2 &&
                (batchKind === "aar" ? (
                  <span className="text-xs text-slate-400">
                    Combined roll-ups are for Findings and Recommendations — an
                    AAR is per-facility.
                  </span>
                ) : (
                  <Btn variant="ghost" onClick={generateCombined}>
                    🧩 Generate combined ({selected.size} schools)
                  </Btn>
                ))}
            </div>
          )}
          {notice && (
            <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {notice}
            </p>
          )}
        </div>
      )}

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
              <div className="flex items-center gap-3">
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-medium text-slate-600">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-violet-600"
                    checked={selected.has(a.id)}
                    onChange={() => toggleSelect(a.id)}
                    aria-label={`Select ${a.clientName} for batch generation`}
                  />
                  Select
                </label>
                <StatusPill status={a.status} />
              </div>
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

      {/* Combined (group) reports */}
      {groupDocs.length > 0 && (
        <Card>
          <h2 className="font-semibold">🧩 Combined reports</h2>
          <p className="mt-1 text-sm text-gray-500">
            District roll-ups generated from a group of selected assessments.
          </p>
          <ul className="mt-3 divide-y divide-gray-100">
            {groupDocs.map((doc) => (
              <li key={doc.id}>
                <Link
                  href={`/reports/${doc.id}`}
                  className="flex min-h-[44px] flex-wrap items-center justify-between gap-2 rounded-lg py-3 transition-colors hover:bg-violet-50/50"
                >
                  <span className="font-medium text-slate-900">{doc.title}</span>
                  <Badge tone="green">
                    Generated · {fmtUpdated(doc.updatedAt)}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
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

      {/* Code Red Hub exchange export */}
      <Card>
        <h2 className="font-semibold">Export for Code Red Hub</h2>
        <p className="mt-1 text-sm text-gray-500">
          Downloads a JSON package the Code Red Hub can import directly —
          assessments, responses, findings, equipment recommendations,
          reports, and schedules. Take your data with you if you adopt the
          Hub later.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="hub-export-scope"
              checked={hubScope === "completed"}
              onChange={() => setHubScope("completed")}
            />
            Completed assessments
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="hub-export-scope"
              checked={hubScope === "all"}
              onChange={() => setHubScope("all")}
            />
            All assessments
          </label>
        </div>
        <Btn
          variant="ghost"
          className="mt-3 justify-start"
          onClick={() => {
            const pkg = buildHubExchange(hubScope === "completed");
            download(
              exchangeFilename(),
              JSON.stringify(pkg, null, 2),
              "application/json;charset=utf-8"
            );
          }}
        >
          📦 Download Hub export (.json)
        </Btn>
        <p className="mt-2 text-xs text-gray-400">
          {hubScope === "completed"
            ? `${db.assessments.filter((a) => a.status === "completed").length} completed assessment(s)`
            : `${db.assessments.list().length} assessment(s)`}{" "}
          · {db.schedules.list().length} schedule item(s) · format sat-hub-exchange v{HUB_EXCHANGE_VERSION}
        </p>
      </Card>
    </div>
  );
}
