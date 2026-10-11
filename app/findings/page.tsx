/**
 * All-findings view: every finding across all assessments in one
 * filterable list. Risk chips + client/school filter + domain filter + text
 * search; each row drills into its assessment. Accepts
 * ?risk=high|moderate|low and ?client=<name> to pre-filter.
 */
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { db, type Finding, type Risk } from "@/lib/store";
import { getCheckpoint } from "@/lib/templates";
import { resolveTemplate, allTemplates } from "@/lib/customTemplates";
import { photosFor } from "@/lib/photos";
import { useMode } from "@/lib/mode";
import {
  Card,
  PageHeader,
  RiskBadge,
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

/** Small non-interactive thumbnail strip for list rows. */
function FindingThumbs({ photoIds }: { photoIds: string[] | undefined }) {
  const photos = photosFor(photoIds).slice(0, 4);
  if (!photos.length) return null;
  return (
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
  );
}

interface FindingRow {
  finding: Finding;
  clientName: string;
  date: string;
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
  const [query, setQuery] = useState("");
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
      if (q) {
        const hay =
          `${r.finding.gapText} ${r.clientName} ${r.domainName} ${r.finding.note}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, riskFilter, clientFilter, domainFilter, query]);

  return (
    <div>
      <PageHeader
        title="Findings"
        subtitle="Every finding across all assessments — filter, search, and drill into the source assessment."
      />
      {mode === "prod" && <ProdNotice />}

      {/* Filters */}
      <div className="mb-4 space-y-3">
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
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title="No findings match"
          body="Try a different risk level, domain, or search term."
        />
      ) : (
        <Card className="!p-2 md:!p-3">
          <ul className="divide-y divide-slate-100">
            {filtered.map((r) => (
              <li key={r.finding.id}>
                <Link
                  href={`/assessments/${r.finding.assessmentId}`}
                  className="flex min-h-[44px] items-start justify-between gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-violet-50/60 md:px-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {r.finding.gapText}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {r.clientName}
                      {r.date ? ` · ${r.date}` : ""}
                      {` · ${r.domainName}`}
                    </p>
                    <FindingThumbs photoIds={r.finding.photoIds} />
                  </div>
                  <div className="shrink-0 pt-0.5">
                    <RiskBadge risk={r.finding.risk} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
