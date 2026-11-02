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
import {
  db,
  type Finding,
  type Risk,
  type CaStatus,
  type ProgramStatus,
} from "@/lib/store";
import {
  CA_ISSUE_CODES,
  CA_REMEDY_CODES,
  caStatusOf,
  isCaOverdue,
} from "@/lib/ca";
import {
  createProgram,
  programRollup,
  programsForClient,
  setProgramStatus,
  setProgramTargetDate,
} from "@/lib/programs";
import { assetLife, lifeBasis } from "@/lib/assets";
import {
  isBulkAssignable,
  normalizeBulkPatch,
  planBulkAssign,
} from "@/lib/bulkCa";
import { download } from "@/lib/reports";
import {
  buildFindingsCsv,
  caPrintLine,
  exportCounts,
  findingsCsvFilename,
} from "@/lib/findingsExport";
import { getCheckpoint } from "@/lib/templates";
import { resolveTemplate, allTemplates } from "@/lib/customTemplates";
import { photosFor, photosReady } from "@/lib/photos";
import { isPostAssessmentPhoto } from "@/lib/photoEvidence";
import { getProfile } from "@/lib/profile";
import { useMode } from "@/lib/mode";
import {
  Card,
  PageHeader,
  RiskBadge,
  Badge,
  EmptyState,
  InfoHint,
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
  campus: string;
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
        campus: a?.campus ?? "",
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
  const [bulkOwner, setBulkOwner] = useState("");
  const [bulkDue, setBulkDue] = useState("");
  const [bulkMsg, setBulkMsg] = useState("");
  // Remediation programs (per school — shown when one client is picked)
  const [progTitle, setProgTitle] = useState("");
  const [progTarget, setProgTarget] = useState("");
  const [progCampus, setProgCampus] = useState("");
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [progMsg, setProgMsg] = useState("");

  useEffect(() => {
    setRows(loadRows());
    // Photo thumbnails resolve from the IndexedDB-backed cache; if
    // hydration finishes after the first render, reload rows so the
    // thumbnails appear (previously they showed only in whichever
    // filter view happened to render after hydration — 2026-10-29
    // production audit).
    let live = true;
    void photosReady().then(() => {
      if (live) setRows(loadRows());
    });
    return () => {
      live = false;
    };
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

  // Header counts describe the VISIBLE (filtered) set, matching the
  // finding count beside them — previously the corrective-action
  // counts were global while the finding count was filtered
  // (2026-10-29 production audit).
  const openCount = filtered.filter((r) => {
    const s = caStatusOf(r.finding);
    return s === "open" || s === "in_progress";
  }).length;
  const overdueCount = filtered.filter((r) => isOverdue(r.finding)).length;

  const updateCa = (f: Finding, patch: Partial<Finding>) => {
    const next: Finding = { ...f, ...patch };
    if (patch.caStatus === "verified") {
      next.caVerifiedAt = new Date().toISOString();
      next.caVerifiedBy = getProfile()?.name ?? "";
    } else if (patch.caStatus) {
      next.caVerifiedAt = undefined;
      next.caVerifiedBy = undefined;
      // Reopening a CA retires its close-out codes — they described a
      // fix that is no longer claimed.
      if (patch.caStatus === "open" || patch.caStatus === "in_progress") {
        next.caIssueCode = undefined;
        next.caRemedyCode = undefined;
      }
    }
    db.findings.upsert(next);
    setRows(loadRows());
  };

  // Bulk assign: applies to the currently visible (filtered) set, but
  // only to actionable findings — corrected/verified are never touched.
  const bulkEligible = filtered.filter((r) => isBulkAssignable(r.finding));
  const bulkPatch = normalizeBulkPatch({
    owner: bulkOwner,
    dueDate: bulkDue,
  });
  const applyBulkAssign = () => {
    const plan = planBulkAssign(
      filtered.map((r) => r.finding),
      { owner: bulkOwner, dueDate: bulkDue }
    );
    if (!plan.patch || plan.updated.length === 0) return;
    plan.updated.forEach((f) => db.findings.upsert(f));
    setRows(loadRows());
    setBulkOwner("");
    setBulkDue("");
    setBulkMsg(
      `Assigned ${plan.updated.length} visible open finding${
        plan.updated.length === 1 ? "" : "s"
      }${plan.patch.owner ? ` to ${plan.patch.owner}` : ""}${
        plan.patch.dueDate ? ` · due ${plan.patch.dueDate}` : ""
      }${
        plan.skippedFinished > 0
          ? ` · ${plan.skippedFinished} corrected/verified left unchanged`
          : ""
      }.`
    );
  };

  // Per-school facility-model data for the selected client: its
  // remediation programs (progress derived live from member CAs) and
  // its end-of-life asset flags. Read fresh each render — every
  // mutation path on this page ends in setRows(loadRows()).
  const clientRows =
    clientFilter === "all"
      ? []
      : rows.filter((r) => r.clientName === clientFilter);
  const clientCampuses = Array.from(
    new Set(clientRows.map((r) => r.campus))
  ).sort();
  const schoolPrograms =
    clientFilter === "all" ? [] : programsForClient(clientFilter);
  const allFindings = db.findings.list();
  const allAssessments = db.assessments.list();
  const clientFlagged =
    clientFilter === "all"
      ? []
      : db.assets
          .filter((a) => a.clientName === clientFilter)
          .filter((a) => {
            const s = assetLife(a).state;
            return s === "past" || s === "near";
          });

  const doCreateProgram = () => {
    const campus = progCampus || clientCampuses[0] || "";
    const keys = picked.filter((k) =>
      clientRows.some(
        (r) => r.campus === campus && r.finding.checkpointKey === k
      )
    );
    const p = createProgram({
      clientName: clientFilter,
      campus,
      title: progTitle,
      targetDate: progTarget || undefined,
      checkpointKeys: keys,
      createdBy: getProfile()?.name ?? "",
    });
    if (!p) {
      setProgMsg(
        "A program needs a title, at least one picked member finding for the campus, and your name — set it in My Profile."
      );
      return;
    }
    setProgTitle("");
    setProgTarget("");
    setPicked([]);
    setPicking(false);
    setProgMsg(
      `Program “${p.title}” created — ${keys.length} member corrective action${keys.length === 1 ? "" : "s"}. It appears in ${clientFilter}'s generated reports as the remediation plan.`
    );
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

      {/* Bulk corrective-action assign: one owner / due date for every
          visible actionable finding at once. Screen-only. */}
      {filtered.length > 0 && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 print:hidden md:p-4">
          <p className="flex items-center gap-0.5 text-sm font-semibold text-slate-800">
            Bulk assign corrective actions
            <InfoHint
              label="how bulk assign works"
              text="Applies to the visible open / in-progress findings (current filters). Corrected and verified findings are never changed, and blank fields are left as-is."
            />
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={bulkOwner}
              onChange={(e) => {
                setBulkOwner(e.target.value);
                setBulkMsg("");
              }}
              placeholder="Owner for all visible"
              aria-label="Bulk corrective action owner"
              className="min-h-[44px] w-52 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
            />
            <input
              type="date"
              value={bulkDue}
              onChange={(e) => {
                setBulkDue(e.target.value);
                setBulkMsg("");
              }}
              aria-label="Bulk corrective action due date"
              className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
            />
            <button
              type="button"
              disabled={!bulkPatch || bulkEligible.length === 0}
              onClick={applyBulkAssign}
              className="min-h-[44px] rounded-xl bg-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Assign to {bulkEligible.length} finding
              {bulkEligible.length === 1 ? "" : "s"}
            </button>
          </div>
          {bulkMsg && (
            <p className="mt-2 text-sm font-medium text-emerald-700" role="status">
              ✓ {bulkMsg}
            </p>
          )}
        </div>
      )}

      {/* Per-school facility model: replacement flags + remediation
          programs for the selected client. Screen-only. */}
      {clientFilter !== "all" && (
        <div className="mb-4 space-y-4 print:hidden">
          {clientFlagged.length > 0 && (
            <div className="rounded-2xl border border-red-200 bg-red-50/60 p-3 md:p-4">
              <p className="flex items-center gap-0.5 text-sm font-semibold text-red-900">
                ⚠ Replacement flags — {clientFilter}
                <InfoHint
                  label="how replacement flags are calculated"
                  text="Basis: install year recorded at a walkthrough touch vs the asset class's expected life. The full asset list is on the school's assessment page and in its reports."
                />
              </p>
              <ul className="mt-2 space-y-1.5">
                {clientFlagged.map((a) => {
                  const life = assetLife(a);
                  return (
                    <li key={a.id} className="text-sm text-red-800">
                      <strong>{a.label}</strong> ({a.campus}) —{" "}
                      {life.state === "past"
                        ? `replace, don't repair: ${lifeBasis(a)} · past its ${life.expected}-yr expected life`
                        : `plan replacement: ${lifeBasis(a)} · about ${life.remaining} yr of expected life left`}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-3 md:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-0.5 text-sm font-semibold text-slate-800">
                Remediation programs — {clientFilter}
                <InfoHint
                  label="how remediation programs work"
                  text="A program groups this school's corrective actions under one name and target date; its milestones are the member actions and progress is their verified share. Programs appear in the school's generated reports as the remediation plan. Corrective actions carry no cost fields in this app, so programs roll up counts, owners and dates — no dollars."
                />
              </p>
              <button
                type="button"
                onClick={() => {
                  setPicking((v) => !v);
                  setProgMsg("");
                }}
                className="min-h-[44px] rounded-xl border border-violet-300 px-4 text-sm font-semibold text-violet-700 hover:bg-violet-50"
              >
                {picking ? "Done picking" : "＋ New program from findings"}
              </button>
            </div>
            {picking && (
              <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
                <p className="flex items-center gap-0.5 text-xs font-medium text-violet-900">
                  {picked.length} picked.
                  <InfoHint
                    label="how to pick program members"
                    text="Tick “Program” on the findings below to make them members, then name the program."
                  />
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={progTitle}
                    onChange={(e) => setProgTitle(e.target.value)}
                    placeholder="Program title — e.g. Perimeter & classroom security"
                    aria-label="Program title"
                    className="min-h-[44px] w-72 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  />
                  <select
                    value={progCampus || clientCampuses[0] || ""}
                    onChange={(e) => setProgCampus(e.target.value)}
                    aria-label="Program campus"
                    className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  >
                    {clientCampuses.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={progTarget}
                    onChange={(e) => setProgTarget(e.target.value)}
                    aria-label="Program target date"
                    className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  />
                  <button
                    type="button"
                    disabled={!progTitle.trim() || picked.length === 0}
                    onClick={doCreateProgram}
                    className="min-h-[44px] rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Create program ({picked.length})
                  </button>
                </div>
              </div>
            )}
            {progMsg && (
              <p className="mt-2 text-sm font-medium text-emerald-700" role="status">
                {progMsg}
              </p>
            )}

            {schoolPrograms.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No programs yet for this school.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {schoolPrograms.map((p) => {
                  const r = programRollup(p, allFindings, allAssessments);
                  return (
                    <div
                      key={p.id}
                      className="rounded-xl border border-slate-200 p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          {p.title}
                        </p>
                        <span className="text-xs text-slate-500">
                          {p.campus} · created by {p.createdBy}
                        </span>
                        <select
                          value={p.status}
                          onChange={(e) => {
                            const ok = setProgramStatus(
                              p.id,
                              e.target.value as ProgramStatus,
                              getProfile()?.name ?? ""
                            );
                            setProgMsg(
                              ok
                                ? ""
                                : "Completing a program needs your name — set it in My Profile."
                            );
                            setRows(loadRows());
                          }}
                          aria-label={`Program status for ${p.title}`}
                          className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"
                        >
                          <option value="planned">Planned</option>
                          <option value="in_progress">In progress</option>
                          <option value="completed">Completed</option>
                        </select>
                        <input
                          type="date"
                          value={p.targetDate ?? ""}
                          onChange={(e) => {
                            setProgramTargetDate(
                              p.id,
                              e.target.value || undefined
                            );
                            setRows(loadRows());
                          }}
                          aria-label={`Program target date for ${p.title}`}
                          className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700"
                        />
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${r.pctVerified}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        {r.summary.verified} of {r.summary.total} member
                        actions verified ({r.pctVerified}%) ·{" "}
                        {r.summary.corrected} corrected ·{" "}
                        {r.summary.actionable} open/in progress
                        {r.summary.overdue > 0 && (
                          <span className="font-semibold text-red-600">
                            {" "}· {r.summary.overdue} overdue
                          </span>
                        )}
                        {r.nextDue ? ` · next due ${r.nextDue}` : ""}
                        {p.status === "completed" && p.completedBy
                          ? ` · ✓ completed by ${p.completedBy}${p.completedAt ? ` on ${p.completedAt.slice(0, 10)}` : ""}`
                          : ""}
                      </p>
                      <ul className="mt-2 space-y-1">
                        {r.members.map((f) => (
                          <li key={f.id} className="text-sm text-slate-700">
                            <span className="font-medium">
                              [{CA_LABELS[caStatusOf(f)]}]
                            </span>{" "}
                            <Link
                              href={`/assessments/${f.assessmentId}`}
                              className="hover:text-violet-700 hover:underline"
                            >
                              {f.gapText}
                            </Link>
                            {f.caOwner ? ` · ${f.caOwner}` : ""}
                            {f.caDueDate ? ` · due ${f.caDueDate}` : ""}
                          </li>
                        ))}
                        {r.members.length < p.checkpointKeys.length && (
                          <li className="text-xs text-slate-400">
                            {p.checkpointKeys.length - r.members.length}{" "}
                            member checkpoint(s) have no finding in the
                            school's current assessments.
                          </li>
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

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
                    {picking && clientFilter !== "all" && (
                      <label className="flex min-h-[38px] items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-2 text-xs font-semibold text-violet-800">
                        <input
                          type="checkbox"
                          checked={picked.includes(f.checkpointKey)}
                          onChange={(e) =>
                            setPicked((prev) =>
                              e.target.checked
                                ? [...new Set([...prev, f.checkpointKey])]
                                : prev.filter((k) => k !== f.checkpointKey)
                            )
                          }
                          aria-label={`Pick for program: ${f.gapText}`}
                          className="h-5 w-5 accent-violet-600"
                        />
                        Program
                      </label>
                    )}
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
                    {(status === "corrected" || status === "verified") && (
                      <>
                        <select
                          value={f.caIssueCode ?? ""}
                          onChange={(e) =>
                            updateCa(f, {
                              caIssueCode: e.target.value || undefined,
                            })
                          }
                          aria-label={`What was wrong for: ${f.gapText}`}
                          className={ctl}
                        >
                          <option value="">What was wrong…</option>
                          {Object.entries(CA_ISSUE_CODES).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                        <select
                          value={f.caRemedyCode ?? ""}
                          onChange={(e) =>
                            updateCa(f, {
                              caRemedyCode: e.target.value || undefined,
                            })
                          }
                          aria-label={`What was done for: ${f.gapText}`}
                          className={ctl}
                        >
                          <option value="">What was done…</option>
                          {Object.entries(CA_REMEDY_CODES).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
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
