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
import {
  buildBackup,
  backupFilename,
  restoreBackup,
  summarizeBackup,
  type BackupFile,
} from "@/lib/backup";

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

/** Each school gets a stable color (hashed from its name) so it's easy
 *  to follow across the picker, the generate bar, and the report list. */
const SCHOOL_COLORS = [
  { bar: "#7c3aed", bg: "#f5f3ff" },
  { bar: "#0284c7", bg: "#f0f9ff" },
  { bar: "#059669", bg: "#ecfdf5" },
  { bar: "#d97706", bg: "#fffbeb" },
  { bar: "#e11d48", bg: "#fff1f2" },
  { bar: "#0891b2", bg: "#ecfeff" },
  { bar: "#4f46e5", bg: "#eef2ff" },
  { bar: "#65a30d", bg: "#f7fee7" },
];

function schoolColor(name: string): { bar: string; bg: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SCHOOL_COLORS[h % SCHOOL_COLORS.length];
}

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
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  const assessments = useMemo<Assessment[]>(() => {
    return [...db.assessments.list()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }, [mode, tick]);

  const reportsByKey = useMemo(() => {
    const m = new Map<string, ReportDoc>();
    for (const r of db.reports.list()) m.set(`${r.assessmentId}:${r.kind}`, r);
    return m;
  }, [mode, tick]);

  const findingsCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of db.findings.list())
      m.set(f.assessmentId, (m.get(f.assessmentId) ?? 0) + 1);
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Exports"
        subtitle="Generate editable reports from completed walkthroughs, or export raw data as CSV."
      />
      {mode === "prod" && <ProdNotice />}

      {/* Step 1 — pick assessments (each school has its own color) */}
      {assessments.length === 0 ? (
        <EmptyState
          title="No assessments yet"
          body="Reports are generated per assessment. Complete a walkthrough first, then generate its reports here."
        />
      ) : (
        <Card>
          <h2 className="font-semibold">1 · Pick assessments</h2>
          <p className="mt-1 text-sm text-gray-500">
            Tap a school to select it — one for its own reports, or several
            for a group. Each school keeps its color everywhere on this page.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
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
          <ul className="mt-3 space-y-2">
            {assessments.map((a) => {
              const c = schoolColor(a.clientName);
              const isSel = selected.has(a.id);
              const n = findingsCount.get(a.id) ?? 0;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => toggleSelect(a.id)}
                    aria-pressed={isSel}
                    className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-left transition"
                    style={{
                      borderColor: isSel ? c.bar : "#e2e8f0",
                      background: isSel ? c.bg : "#ffffff",
                    }}
                  >
                    <span
                      aria-hidden
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-sm font-bold text-white"
                      style={{
                        borderColor: c.bar,
                        background: isSel ? c.bar : "transparent",
                        color: isSel ? "#ffffff" : "transparent",
                      }}
                    >
                      ✓
                    </span>
                    <span
                      aria-hidden
                      className="h-3.5 w-3.5 shrink-0 rounded-full"
                      style={{ background: c.bar }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-900">
                        {a.clientName}
                        <span className="font-normal text-slate-500">
                          {" "}
                          — {a.campus}
                        </span>
                      </span>
                      <span className="block text-xs text-slate-500">
                        {a.cover?.date || a.createdAt.slice(0, 10)} · {n}{" "}
                        finding{n === 1 ? "" : "s"}
                      </span>
                    </span>
                    <StatusPill status={a.status} />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Generate bar — sticks once anything is selected */}
      {selected.size > 0 && (
        <div className="sticky top-16 z-20 -mx-4 bg-[#EEF1F8]/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
              <span className="flex -space-x-1">
                {selectedAssessments.slice(0, 6).map((a) => (
                  <span
                    key={a.id}
                    title={a.clientName}
                    className="h-3.5 w-3.5 rounded-full ring-2 ring-[#EEF1F8]"
                    style={{ background: schoolColor(a.clientName).bar }}
                  />
                ))}
              </span>
              {selected.size} selected ·
            </span>
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
                <span className="text-xs text-slate-500">
                  Combined roll-ups are for Findings and Recommendations — an
                  AAR is per-facility.
                </span>
              ) : (
                <Btn variant="ghost" onClick={generateCombined}>
                  🧩 Generate combined ({selected.size} schools)
                </Btn>
              ))}
          </div>
          {notice && (
            <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {notice}
            </p>
          )}
        </div>
      )}

      {/* Step 2 — your reports, grouped by school in the same colors */}
      {assessments.length > 0 && (
        <Card>
          <h2 className="font-semibold">2 · Your reports</h2>
          <p className="mt-1 text-sm text-gray-500">
            Open a generated report to edit, print, or share it.
          </p>
          <div className="mt-4 space-y-5">
            {assessments.map((a) => {
              const c = schoolColor(a.clientName);
              return (
                <div key={a.id}>
                  <p className="flex items-center gap-2 font-semibold text-slate-900">
                    <span
                      aria-hidden
                      className="h-3.5 w-3.5 rounded-full"
                      style={{ background: c.bar }}
                    />
                    {a.clientName}
                    <span className="font-normal text-slate-500">
                      — {a.campus}
                    </span>
                    {a.review?.state === "approved" && (
                      <Badge tone="green">✓ Approved</Badge>
                    )}
                    {a.review?.state === "pending" && (
                      <Badge tone="amber">⏳ In review</Badge>
                    )}
                  </p>
                  <ul className="mt-2 divide-y divide-gray-100 border-l-4 pl-3" style={{ borderColor: c.bar }}>
                    {(Object.keys(REPORT_LABELS) as ReportKind[]).map(
                      (kind) => {
                        const doc = reportsByKey.get(`${a.id}:${kind}`);
                        return (
                          <li
                            key={kind}
                            className="flex flex-wrap items-center gap-2 py-2"
                          >
                            <span className="min-w-[180px] flex-1">
                              <span className="font-medium text-slate-800">
                                <span aria-hidden className="mr-1.5">
                                  {KIND_ICONS[kind]}
                                </span>
                                {REPORT_LABELS[kind]}
                              </span>
                              <span className="block text-xs text-slate-400">
                                {KIND_DESCS[kind]}
                              </span>
                            </span>
                            {doc ? (
                              <Badge tone="green">
                                Generated · {fmtUpdated(doc.updatedAt)}
                              </Badge>
                            ) : (
                              <Badge tone="gray">Not generated</Badge>
                            )}
                            <Btn
                              variant="ghost"
                              onClick={() => generate(a, kind)}
                            >
                              {doc ? "Regenerate" : "Generate"}
                            </Btn>
                            {doc && (
                              <Link
                                href={`/reports/${doc.id}`}
                                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                              >
                                Open
                              </Link>
                            )}
                          </li>
                        );
                      }
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>
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
                  <span className="flex items-center gap-2 font-medium text-slate-900">
                    <span className="flex -space-x-1">
                      {doc.assessmentId
                        .slice("group:".length)
                        .split("|")
                        .map((id) => {
                          const a = assessments.find((x) => x.id === id);
                          return a ? (
                            <span
                              key={id}
                              title={a.clientName}
                              className="h-3.5 w-3.5 rounded-full ring-2 ring-white"
                              style={{
                                background: schoolColor(a.clientName).bar,
                              }}
                            />
                          ) : null;
                        })}
                    </span>
                    {doc.title}
                  </span>
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

      {/* Full backup & restore */}
      <Card>
        <h2 className="font-semibold">Backup & Restore</h2>
        <p className="mt-1 text-sm text-gray-500">
          The current mode's ({mode.toUpperCase()}) dataset on this device —
          assessments, reports, photos, schedules, templates — plus your
          profile and branding, in one file. Download it to move to a new
          phone or keep a safety copy. Restoring a backup replaces only
          that mode's data; the other mode is untouched. Your AI key is
          never included in a backup.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Btn
            variant="ghost"
            className="justify-start"
            onClick={() =>
              download(
                backupFilename(),
                JSON.stringify(buildBackup(), null, 2),
                "application/json;charset=utf-8"
              )
            }
          >
            💾 Download full backup (.json)
          </Btn>
          <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            ♻ Restore from backup…
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try {
                  const parsed: unknown = JSON.parse(await f.text());
                  const summary = summarizeBackup(parsed);
                  if ("error" in summary) {
                    setBackupMsg(summary.error);
                    return;
                  }
                  const when = summary.exportedAt
                    ? new Date(summary.exportedAt).toLocaleString()
                    : "unknown date";
                  const modeNote =
                    summary.mode !== mode
                      ? ` Heads up: this is a ${summary.mode.toUpperCase()} backup — it will restore into the ${summary.mode.toUpperCase()} dataset (you're viewing ${mode.toUpperCase()}), leaving your current view unchanged.`
                      : "";
                  if (
                    !window.confirm(
                      `Restore the ${summary.mode.toUpperCase()} backup from ${when} (${summary.entries} data entries)? This REPLACES the current ${summary.mode.toUpperCase()} data on this device.${modeNote}`
                    )
                  ) {
                    return;
                  }
                  const result = restoreBackup(parsed as BackupFile);
                  if (result.skipped.length > 0) {
                    setBackupMsg(
                      `Restored ${result.restored} entries into ${result.mode.toUpperCase()}; ${result.skipped.length} invalid entr${result.skipped.length === 1 ? "y was" : "ies were"} skipped. Reloading…`
                    );
                    setTimeout(() => window.location.reload(), 1200);
                  } else {
                    window.location.reload();
                  }
                } catch {
                  setBackupMsg("Couldn't read that file — is it a backup .json?");
                }
              }}
            />
          </label>
        </div>
        {backupMsg && (
          <p className="mt-2 text-sm text-red-600">{backupMsg}</p>
        )}
      </Card>
    </div>
  );
}
