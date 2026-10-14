/**
 * Findings register — dedicated print view, mirroring the reports
 * print pattern. The findings list's Print button links here carrying
 * its current filter state (?risk=&client=&domain=&ca=&q=), so the
 * printout contains exactly the on-screen register.
 *
 * Why a route: printing from the interactive page via window.print()
 * hung automated browsers on the native print dialog (audit #2,
 * 2026-10-13) and was inconsistent with reports, which have always
 * had print routes. On this page the Print button is a normal user
 * gesture on a print-formatted view, same as reports.
 */
"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { db, type Finding, type Risk } from "@/lib/store";
import { caStatusOf, isCaOverdue } from "@/lib/ca";
import { caPrintLine, exportCounts } from "@/lib/findingsExport";
import { getCheckpoint } from "@/lib/templates";
import { resolveTemplate } from "@/lib/customTemplates";
import { useMode } from "@/lib/mode";
import { Btn, RiskBadge } from "@/components/ui";

interface FindingRow {
  finding: Finding;
  clientName: string;
  date: string;
  domainName: string;
  domainKey: string;
  templateName: string;
}

const RISK_SEVERITY: Record<Risk, number> = { high: 0, moderate: 1, low: 2 };

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

function PrintInner() {
  const [mode] = useMode();
  const sp = useSearchParams();
  const [rows, setRows] = useState<FindingRow[] | null>(null);

  useEffect(() => {
    setRows(loadRows());
  }, [mode]);

  if (!rows) {
    return (
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  // Same filter semantics as the findings list, from its query state.
  const risk = sp.get("risk") ?? "all";
  const client = sp.get("client") ?? "all";
  const domain = sp.get("domain") ?? "all";
  const ca = sp.get("ca") ?? "all";
  const q = (sp.get("q") ?? "").trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (risk !== "all" && r.finding.risk !== risk) return false;
    if (client !== "all" && r.clientName !== client) return false;
    if (domain !== "all" && r.domainKey !== domain) return false;
    if (ca === "overdue") {
      if (!isCaOverdue(r.finding)) return false;
    } else if (ca !== "all") {
      if (caStatusOf(r.finding) !== ca) return false;
    }
    if (q) {
      const hay =
        `${r.finding.gapText} ${r.clientName} ${r.domainName} ${r.finding.note} ${r.finding.caOwner ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const counts = exportCounts(filtered);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      {/* Screen-only action bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/findings">
          <Btn variant="ghost">← Back to findings</Btn>
        </Link>
        <Btn onClick={() => window.print()}>🖨 Print / Save as PDF</Btn>
      </div>

      <h1 className="text-xl font-bold text-slate-900">Findings register</h1>
      <p className="mt-1 text-sm text-slate-600">
        {today} · {counts.total} finding{counts.total === 1 ? "" : "s"} (
        {counts.high} high, {counts.moderate} moderate, {counts.low} low) ·{" "}
        {counts.open} corrective action{counts.open === 1 ? "" : "s"} open
        {counts.overdue > 0 && ` · ${counts.overdue} overdue`}
        {client !== "all" && ` · Client: ${client}`}
        {mode === "demo" && " · DEMO data"}
      </p>

      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          No findings match the current filters.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-200">
          {filtered.map((r) => (
            <li key={r.finding.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-slate-900">
                  {r.finding.gapText}
                </p>
                <RiskBadge risk={r.finding.risk} />
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {r.clientName}
                {r.date ? ` · ${r.date}` : ""} · {r.domainName}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                {caPrintLine(r.finding)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function FindingsPrintPage() {
  return (
    <Suspense>
      <PrintInner />
    </Suspense>
  );
}
