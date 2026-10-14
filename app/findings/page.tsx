/**
 * All-findings view: every finding across all assessments in one
 * filterable list. Risk chips + client/school filter + domain filter + text
 * search; each row drills into its assessment. Accepts
 * ?risk=high|moderate|low, ?client=<name>, and ?q=<text> (the global
 * header search deep-links findings this way) to pre-filter.
 */
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { db, type Finding, type Risk, type CaStatus } from "@/lib/store";
import { caStatusOf, isCaOverdue } from "@/lib/ca";
import { download } from "@/lib/reports";
import {
  buildFindingsCsv,
  caPrintLine,
  exportCounts,
  findingsCsvFilename,
} from "@/lib/findingsExport";
import { getCheckpoint } from "@/lib/templates";
import { resolveTemplate, allTemplates } from "@/lib/customTemplates";
import { photosFor } from "@/lib/photos";
import { isPostAssessmentPhoto } from "@/lib/photoEvidence";
import { getProfile } from "@/lib/profile";
import { useMode } from "@/lib/mode";
import {
  Card,
  PageHeader,
  RiskBadge,
  Badge,
  EmptyState,
  inputCls,
} from "@/components/ui";
import ProdNotice from "@/components/ProdNotice";

const RISK_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "high", label: "High" },
  { key: "moderate", label: "Moderate" },
  { key: "low", label: "Low" },
];

const RISK_SEVERITY: Record<Risk, number> = { high: 0, moderate: 1, low: 2 };

const CA_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All actions" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "corrected", label: "Corrected" },
  { key: "verified", label: "Verified" },
  { key: "overdue", label: "⚠ Overdue" },
];

const CA_LABELS: Record<CaStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  corrected: "Corrected",
  verified: "Verified",
};

function isOverdue(f: Finding): boolean {
  return isCaOverdue(f);
}

/** Small non-interactive thumbnail strip for list rows. When any of
 *  the finding's photos was added after the assessment closed, the
 *  strip says so — post-assessment evidence is never silently mixed
 *  (photo standard, 2026-10-14). */
function FindingThumbs({
  photoIds,
  completedAt,
}: {
  photoIds: string[] | undefined;
  completedAt?: string;
}) {
  const all = photosFor(photoIds);
  const photos = all.slice(0, 4);
  if (!photos.length) return null;
  const hasPost = all.some((p) =>
    isPostAssessmentPhoto({ completedAt }, p)
  );
  return (
    <div>
      <div className="mt-2 flex gap-1.5" aria-label={`${photos.length} photos`}>
        {photos.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={p.id}
            src={p.dataUrl}
            alt="Evidence photo"
            className="h-10 w-10 rounded-lg border border-slate-200 object-cover"
            loading="lazy"
          />
        ))}
      </div>
      {hasPost && (
        <p className="mt-1 text-[11px] font-semibold text-amber-700">
          📷 Includes post-assessment photo
          {all.length > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}

interface FindingRow {
  finding: Finding;
  clientName: string;
  date: string;
  completedAt?: string;
  domainName: string;
  domainKey: string;
  templateName: string;
}

function loadRows(): FindingRow[] {
  return db.findings
    .list()
    .map((f) => {
      const a = db.assessments.get(f.assessmentId);
      const template = resolveTemplate(a?.templateId ?? "");
      const hit = getCheckpoint(template, f.checkpointKey);
      return {
        finding: f,
        clientName: a?.clientName ?? "—",
        date: (a?.completedAt ?? a?.createdAt ?? "").slice(0, 10),
        completedAt: a?.completedAt,
        domainName: hit?.domain.name ?? "—",
        domainKey: hit ? `${template.id}:${hit.domain.id}` : "",
        templateName: template.name,
      };
    })
    .sort(
      (x, y) =>
        RISK_SEVERITY[x.finding.risk] - RISK_SEVERITY[y.finding.risk] ||
        y.date.localeCompare(x.date)
    );
}

export default function FindingsPage() {
  return (
    <Suspense>
      <FindingsInner />
    </Suspense>
  );
}

function FindingsInner() {
  const [mode] = useMode();
  const searchParams = useSearchParams();
  const initialRisk = searchParams.get("risk");
  const [riskFilter, setRiskFilter] = useState(
    initialRisk && ["high", "moderate", "low"].includes(initialRisk)
      ? initialRisk
      : "all"
  );
  const [domainFilter, setDomainFilter] = useState("all");
  const initialClient = searchParams.get("client");
  const [clientFilter, setClientFilter] = useState(initialClient ?? "all");
  const initialCa = searchParams.get("ca");
  const [caFilter, setCaFilter] = useState(
    initialCa &&
      ["open", "in_progress", "corrected", "verified", "overdue"].includes(initialCa)
      ? initialCa
      : "all"
  );
  const initialQuery = searchParams.get("q");
  const [query, setQuery] = useState(initialQuery ?? "");
  const [rows, setRows] = useState<FindingRow[]>([]);

  useEffect(() => {
    setRows(loadRows());
  }, [mode]);

  const domainOptions = useMemo(
    () =>
      allTemplates().flatMap(({ template: t, custom }) =>
        t.domains.map((d) => ({
          key: `${t.id}:${d.id}`,
          label: `${d.name} — ${t.name}${custom ? " (custom)" : ""}`,
        }))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode]
  );

  const clientOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.clientName))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (riskFilter !== "all" && r.finding.risk !== riskFilter) return false;
      if (clientFilter !== "all" && r.clientName !== clientFilter) return false;
      if (domainFilter !== "all" && r.domainKey !== domainFilter) return false;
      if (caFilter === "overdue") {
        if (!isOverdue(r.finding)) return false;
      } else if (caFilter !== "all") {
        if (caStatusOf(r.finding) !== caFilter) return false;
      }
      if (q) {
        const hay =
          `${r.finding.gapText} ${r.clientName} ${r.domainName} ${r.finding.note} ${r.finding.caOwner ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, riskFilter, clientFilter, domainFilter, caFilter, query]);

  const openCount = rows.filter((r) => {
    const s = caStatusOf(r.finding);
    return s === "open" || s === "in_progress";
  }).length;
  const overdueCount = rows.filter((r) => isOverdue(r.finding)).length;

  const updateCa = (f: Finding, patch: Partial<Finding>) => {
    const next: Finding = { ...f, ...patch };
    if (patch.caStatus === "verified") {
      next.caVerifiedAt = new Date().toISOString();
      next.caVerifiedBy = getProfile()?.name ?? "";
    } else if (patch.caStatus) {
      next.caVerifiedAt = undefined;
      next.caVerifiedBy = undefined;
    }
    db.findings.upsert(next);
    setRows(loadRows());
  };

  const printCounts = exportCounts(filtered);
  const today = new Date().toISOString().slice(0, 10);
  const exportBtnCls =
    "inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-violet-300 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50 print:hidden";

  return (
    <div>
      <PageHeader
        title="Findings"
        subtitle="Every finding across all assessments — filter, search, and drill into the source assessment."
        actions={
          <>
            <button
              type="button"
              disabled={filtered.length === 0}
              onClick={() =>
                download(
                  findingsCsvFilename(
                    clientFilter !== "all" ? clientFilter : null,
                    today
                  ),
                  buildFindingsCsv(filtered),
                  "text/csv;charset=utf-8"
                )
              }
              className={exportBtnCls}
            >
              📥 Export CSV ({filtered.length})
            </button>
            {filtered.length === 0 ? (
              <button type="button" disabled className={exportBtnCls}>
                🖨 Print
              </button>
            ) : (
              <Link
                href={(() => {
                  const p = new URLSearchParams();
                  if (riskFilter !== "all") p.set("risk", riskFilter);
                  if (clientFilter !== "all") p.set("client", clientFilter);
                  if (domainFilter !== "all") p.set("domain", domainFilter);
                  if (caFilter !== "all") p.set("ca", caFilter);
                  if (query.trim()) p.set("q", query.trim());
                  const qs = p.toString();
                  return qs ? `/findings/print?${qs}` : "/findings/print";
                })()}
                className={exportBtnCls}
              >
                🖨 Print
              </Link>
            )}
          </>
        }
      />
      {mode === "prod" && <ProdNotice />}

      {/* Filters */}
      <div className="mb-4 space-y-3 print:hidden">
        <div className="flex flex-wrap gap-2">
          {RISK_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setRiskFilter(f.key)}
              aria-pressed={riskFilter === f.key}
              className={`flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold transition-all ${
                riskFilter === f.key
                  ? "bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-[0_4px_14px_-4px_rgba(124,58,237,0.6)]"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {CA_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setCaFilter(f.key)}
              aria-pressed={caFilter === f.key}
              className={`flex min-h-[36px] items-center rounded-full px-3 text-xs font-semibold transition-all ${
                caFilter === f.key
                  ? "bg-slate-800 text-white"
                  : "border border-slate-200 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            aria-label="Filter by client or school"
            className={inputCls}
          >
            <option value="all">All clients / schools</option>
            {clientOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
            aria-label="Filter by domain"
            className={inputCls}
          >
            <option value="all">All domains</option>
            {domainOptions.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search gap text, client, notes…"
            aria-label="Search findings"
            className={inputCls}
          />
        </div>
      </div>

      <p className="mb-3 text-sm text-slate-500">
        {filtered.length} finding{filtered.length === 1 ? "" : "s"}
        {rows.length > 0 && (
          <>
            {" "}· {openCount} corrective action{openCount === 1 ? "" : "s"} open
            {overdueCount > 0 && (
              <span className="font-semibold text-red-600">
                {" "}· {overdueCount} overdue
              </span>
            )}
          </>
        )}
      </p>

      {filtered.length === 0 ? (
        rows.length === 0 ? (
          <EmptyState
            title="No findings yet"
            body="Findings are derived when an assessment is completed — checkpoints answered “no” become findings here, with corrective-action tracking."
          />
        ) : (
          <EmptyState
            title="No findings match"
            body="Try a different risk level, domain, or search term."
          />
        )
      ) : (
        <>
        {/* Print-only register header: states exactly what this
            printout contains (the current filtered set). */}
        <div className="mb-4 hidden print:block">
          <p className="text-sm text-slate-700">
            Findings register · {today} · {printCounts.total} finding
            {printCounts.total === 1 ? "" : "s"} ({printCounts.high} high,{" "}
            {printCounts.moderate} moderate, {printCounts.low} low) ·{" "}
            {printCounts.open} corrective action
            {printCounts.open === 1 ? "" : "s"} open
            {printCounts.overdue > 0 &&
              ` · ${printCounts.overdue} overdue`}
            {clientFilter !== "all" && ` · Client: ${clientFilter}`}
          </p>
        </div>
        <Card className="!p-2 md:!p-3">
          <ul className="divide-y divide-slate-100">
            {filtered.map((r) => {
              const f = r.finding;
              const status = caStatusOf(f);
              const overdue = isOverdue(f);
              const ctl =
                "min-h-[38px] rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700";
              return (
                <li key={f.id}>
                  <Link
                    href={`/assessments/${f.assessmentId}`}
                    className="flex min-h-[44px] items-start justify-between gap-3 rounded-xl px-2 pt-3 transition-colors hover:bg-violet-50/60 md:px-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {f.gapText}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {r.clientName}
                        {r.date ? ` · ${r.date}` : ""}
                        {` · ${r.domainName}`}
                      </p>
                      <FindingThumbs photoIds={f.photoIds} completedAt={r.completedAt} />
                      <p className="mt-1 hidden text-xs text-slate-600 print:block">
                        {caPrintLine(f)}
                      </p>
                    </div>
                    <div className="shrink-0 pt-0.5">
                      <RiskBadge risk={f.risk} />
                    </div>
                  </Link>

                  {/* Corrective-action tracker (interactive — screen only;
                      print shows the caPrintLine summary instead) */}
                  <div className="flex flex-wrap items-center gap-2 px-2 pb-3 pt-1 md:px-3 print:hidden">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                      Action
                    </span>
                    <select
                      value={status}
                      onChange={(e) =>
                        updateCa(f, { caStatus: e.target.value as CaStatus })
                      }
                      aria-label={`Corrective action status for: ${f.gapText}`}
                      className={ctl}
                    >
                      {(Object.keys(CA_LABELS) as CaStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {CA_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <input
                      key={`${f.id}:${f.caOwner ?? ""}`}
                      defaultValue={f.caOwner ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (f.caOwner ?? ""))
                          updateCa(f, { caOwner: v || undefined });
                      }}
                      placeholder="Owner"
                      aria-label="Corrective action owner"
                      className={`${ctl} w-32`}
                    />
                    <input
                      type="date"
                      value={f.caDueDate ?? ""}
                      onChange={(e) =>
                        updateCa(f, { caDueDate: e.target.value || undefined })
                      }
                      aria-label="Corrective action due date"
                      className={ctl}
                    />
                    {overdue && <Badge tone="red">⚠ Overdue</Badge>}
                    {status === "verified" && f.caVerifiedAt && (
                      <span className="text-xs font-medium text-emerald-700">
                        ✓ Verified {f.caVerifiedAt.slice(0, 10)}
                        {f.caVerifiedBy ? ` by ${f.caVerifiedBy}` : ""}
                      </span>
                    )}
                    {status === "corrected" && (
                      <button
                        type="button"
                        onClick={() => updateCa(f, { caStatus: "verified" })}
                        className="min-h-[38px] rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        ✓ Verify fix
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        </>
      )}
    </div>
  );
}
