/**
 * Print-optimized report view: clean client-ready layout with branded
 * header, the full report body, and photo evidence embedded per finding.
 * Use the browser's Print → Save as PDF for a PDF copy.
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  db,
  type Assessment,
  type EquipmentItem,
  type Finding,
  type ReportDoc,
} from "@/lib/store";
import { resolveTemplate } from "@/lib/customTemplates";
import { photosFor } from "@/lib/photos";
import { REPORT_LABELS } from "@/lib/reports";
import { renderMarkdown } from "@/components/MarkdownView";
import { useMode } from "@/lib/mode";
import { Btn, RiskBadge, EmptyState, PageHeader } from "@/components/ui";
import ProdNotice from "@/components/ProdNotice";
import { useBranding } from "@/lib/branding";

export default function ReportPrintPage() {
  const [branding] = useBranding();
  const params = useParams();
  const id = params.id as string;
  const [mode] = useMode();
  const [loaded, setLoaded] = useState(false);
  const [doc, setDoc] = useState<ReportDoc | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);

  useEffect(() => {
    const d = db.reports.get(id) ?? null;
    setDoc(d);
    if (d) {
      const a = db.assessments.get(d.assessmentId) ?? null;
      setAssessment(a);
      setFindings(
        db.findings
          .filter((f) => f.assessmentId === d.assessmentId)
          .sort((x, y) => {
            const rank: Record<string, number> = { high: 0, moderate: 1, low: 2 };
            return (rank[x.risk] ?? 3) - (rank[y.risk] ?? 3);
          })
      );
      setEquipment(db.equipment.filter((e) => e.assessmentId === d.assessmentId));
    }
    setLoaded(true);
  }, [id]);

  if (!loaded) return null;

  if (mode === "prod" || !doc) {
    return (
      <div>
        <PageHeader title="Print report" />
        {mode === "prod" && <ProdNotice />}
        <EmptyState
          title="Report not found"
          body="This report may have been deleted."
          action={
            <Link
              href="/reports"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              ← Back to Reports
            </Link>
          }
        />
      </div>
    );
  }

  const template = assessment ? resolveTemplate(assessment.templateId) : null;
  const assessorNames = assessment
    ? [
        ...db.assessors
          .filter((x) => assessment.assessorIds.includes(x.id))
          .map((x) => x.name),
        ...(assessment.cover?.assessors?.split(/[,;]/).map((s) => s.trim()) ?? []),
      ]
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .join(", ") || "Not recorded"
    : "—";
  const withPhotos = findings.filter((f) => (f.photoIds?.length ?? 0) > 0);

  return (
    <div>
      {/* Screen-only action bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Btn onClick={() => window.print()}>🖨 Print / Save as PDF</Btn>
        <Link
          href={`/reports/${doc.id}`}
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ← Back to report
        </Link>
      </div>

      {/* Branded report header */}
      <div className="print-banner overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-indigo-600 to-indigo-700 p-6 text-white md:p-8">
        {branding && (branding.companyName.trim() || branding.logoDataUrl) && (
          <div className="mb-4 flex items-center gap-3">
            {branding.logoDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoDataUrl}
                alt=""
                className="h-11 max-w-[180px] rounded-lg bg-white object-contain p-1"
              />
            )}
            {branding.companyName.trim() && (
              <p className="text-lg font-bold">{branding.companyName.trim()}</p>
            )}
          </div>
        )}
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-200">
          School safety assessment
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
          {doc.title || REPORT_LABELS[doc.kind]}
        </h1>
        {assessment && (
          <div className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <p><span className="text-violet-200">Client:</span> <strong>{assessment.clientName}</strong></p>
            <p><span className="text-violet-200">Campus:</span> <strong>{assessment.campus}</strong></p>
            <p><span className="text-violet-200">Assessment date:</span> <strong>{(assessment.cover?.date || assessment.createdAt).slice(0, 10)}</strong></p>
            <p><span className="text-violet-200">Template:</span> <strong>{template?.name ?? "—"}</strong></p>
            <p className="sm:col-span-2"><span className="text-violet-200">Assessor(s):</span> <strong>{assessorNames}</strong></p>
          </div>
        )}
        <p className="mt-4 border-t border-white/20 pt-3 text-xs text-violet-200">
          Prepared by{" "}
          {branding?.companyName.trim()
            ? `${branding.companyName.trim()} · `
            : ""}
          {assessorNames} · Report date {doc.updatedAt.slice(0, 10)}
        </p>
      </div>

      {/* Report body */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
        {renderMarkdown(doc.markdown)}
      </div>

      {/* Photo evidence appendix */}
      {withPhotos.length > 0 && (
        <div className="mt-6 break-before-page rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
          <h2 className="mb-1 text-xl font-bold text-slate-900">Photo evidence</h2>
          <p className="mb-4 text-sm text-slate-500">
            Field photos captured during the walkthrough, grouped by finding.
          </p>
          <div className="space-y-6">
            {withPhotos.map((f) => {
              const photos = photosFor(f.photoIds);
              if (!photos.length) return null;
              return (
                <div key={f.id} className="break-inside-avoid">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">{f.gapText}</p>
                    <RiskBadge risk={f.risk} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
                    {photos.map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={p.id}
                        src={p.dataUrl}
                        alt={f.gapText}
                        className="h-40 w-full rounded-xl border border-slate-200 object-cover"
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {equipment.length > 0 && doc.kind === "recommendations" && (
        <div className="mt-6 break-inside-avoid rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
          <h2 className="mb-3 text-xl font-bold text-slate-900">Equipment summary</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-semibold">Item</th>
                <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-semibold">Detail</th>
                <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-semibold">Priority</th>
              </tr>
            </thead>
            <tbody>
              {equipment.map((e) => (
                <tr key={e.id}>
                  <td className="border border-slate-200 px-3 py-2 font-medium">{e.name}</td>
                  <td className="border border-slate-200 px-3 py-2">{e.detail || "—"}</td>
                  <td className="border border-slate-200 px-3 py-2"><RiskBadge risk={e.priority} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
