"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { db, nowIso, type ReportDoc } from "@/lib/store";
import { useMode } from "@/lib/mode";
import { Btn, Card, EmptyState, Modal, PageHeader, inputCls } from "@/components/ui";
import { deleteReport } from "@/lib/deleteReport";
import ProdNotice from "@/components/ProdNotice";
import { REPORT_LABELS, download, slug, buildShareHtml, buildCheckpointIndex } from "@/lib/reports";
import { resolveTemplate } from "@/lib/customTemplates";
import { renderMarkdown } from "@/components/MarkdownView";
import { listPhotos } from "@/lib/photos";
import { buildPhotoLog } from "@/lib/photoEvidence";
import { FindingEvidenceBlock, PhotoLog } from "@/components/PhotoEvidence";
import AiDraftButton, { AiDraftBadge } from "@/components/AiDraftButton";
import type { DraftSection } from "@/lib/draft";

/* ── Page ── */

export default function ReportViewPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const [mode] = useMode();
  const [doc, setDoc] = useState<ReportDoc | null>(null);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<"preview" | "edit">("preview");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [aiInserted, setAiInserted] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const d = db.reports.get(id) ?? null;
    setDoc(d);
    setDraft(d?.markdown ?? "");
    setLoaded(true);
  }, [id]);

  const dirty = doc !== null && draft !== doc.markdown;

  const save = () => {
    if (!doc) return;
    const updated: ReportDoc = { ...doc, markdown: draft, updatedAt: nowIso() };
    db.reports.upsert(updated);
    setDoc(updated);
    setSavedAt(new Date().toLocaleTimeString());
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const shareHtml = () => {
    if (!doc) return;
    const aid = doc.assessmentId;
    const a = db.assessments.get(aid);
    if (!a) {
      // Orphaned report (its assessment was deleted): say so instead of
      // the old silent no-op that looked like a dead button.
      setShareMsg(
        "This report's assessment no longer exists on this device, so a share file can't be built. You can still copy or download the report text."
      );
      return;
    }
    setShareMsg(null);
    const html = buildShareHtml({
      report: { ...doc, markdown: draft },
      assessment: a,
      findings: db.findings.filter((f) => f.assessmentId === aid),
      responses: db.responses.filter((r) => r.assessmentId === aid),
      equipment: db.equipment.filter((e) => e.assessmentId === aid),
      template: resolveTemplate(a.templateId),
    });
    download(
      `${slug(doc.title || REPORT_LABELS[doc.kind])}.html`,
      html,
      "text/html;charset=utf-8"
    );
  };

  const aiSection: DraftSection =
    doc?.kind === "recommendations" ? "recommendations" : "executive-summary";

  const getAiData = () => {
    if (!doc) return {};
    const aid = doc.assessmentId;
    const a = db.assessments.get(aid);
    const responses = db.responses.filter((r) => r.assessmentId === aid);
    return {
      assessment: a
        ? {
            client: a.clientName,
            campus: a.campus,
            date: a.cover?.date ?? "",
            template: a.templateId,
          }
        : {},
      counts: {
        total: responses.length,
        yes: responses.filter((r) => r.answer === "yes").length,
        no: responses.filter((r) => r.answer === "no").length,
        na: responses.filter((r) => r.answer === "na").length,
      },
      findings: db.findings
        .filter((f) => f.assessmentId === aid)
        .map((f) => ({ gap: f.gapText, risk: f.risk, note: f.note })),
      equipment: db.equipment
        .filter((e) => e.assessmentId === aid)
        .map((e) => ({ name: e.name, detail: e.detail, priority: e.priority })),
    };
  };

  const insertAiDraft = (aiDraft: string) => {
    const el = taRef.current;
    if (el) {
      const start = el.selectionStart ?? draft.length;
      const end = el.selectionEnd ?? draft.length;
      setDraft(
        `${draft.slice(0, start)}\n\n${aiDraft}\n\n${draft.slice(end)}`.trim() +
          "\n"
      );
    } else {
      setDraft(`${draft}\n\n${aiDraft}\n`);
    }
    setAiInserted(true);
  };

  if (!loaded) return null;

  if (!doc) {
    return (
      <div>
        <PageHeader title="Report" />
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

  return (
    <div className="space-y-4">
      <PageHeader
        title={doc.title || REPORT_LABELS[doc.kind]}
        subtitle={`Updated ${new Date(doc.updatedAt).toLocaleString()}`}
        actions={
          <Link
            href="/reports"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ← Reports
          </Link>
        }
      />

      {/* Preview / Edit tabs */}
      <div className="flex gap-2" role="tablist" aria-label="Report view">
        {(["preview", "edit"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-[44px] flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === t
                ? "btn-brand"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {t === "preview" ? "👁 Preview" : "✏️ Edit"}
          </button>
        ))}
      </div>

      {tab === "preview" ? (
        <>
          <Card className="prose-none">{renderMarkdown(draft)}</Card>
          {/* Photo evidence at each finding + closing Photo Log —
              the print view and shared HTML carry the same blocks,
              so the preview must too (photo standard, 2026-10-14;
              audit #2 found the preview silently omitting photos). */}
          {(() => {
            if (!doc || doc.assessmentId.startsWith("group:")) return null;
            const a = db.assessments.get(doc.assessmentId);
            if (!a) return null;
            const rank: Record<string, number> = { high: 0, moderate: 1, low: 2 };
            const findings = db.findings
              .filter((f) => f.assessmentId === doc.assessmentId)
              .sort((x, y) => (rank[x.risk] ?? 3) - (rank[y.risk] ?? 3));
            const withPhotos = findings.filter(
              (f) => (f.photoIds?.length ?? 0) > 0
            );
            const log = buildPhotoLog({
              assessment: a,
              findings,
              responses: db.responses.filter(
                (r) => r.assessmentId === doc.assessmentId
              ),
              photosById: new Map(listPhotos().map((p) => [p.id, p])),
              checkpointIdx: buildCheckpointIndex(resolveTemplate(a.templateId)),
            });
            if (!withPhotos.length && !log.length) return null;
            return (
              <>
                {withPhotos.length > 0 && (
                  <Card className="mt-4">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                      Photo evidence
                    </h3>
                    <div className="mt-3 space-y-5">
                      {findings.map((f, i) => (
                        <FindingEvidenceBlock
                          key={f.id}
                          assessment={a}
                          finding={f}
                          index={i}
                        />
                      ))}
                    </div>
                  </Card>
                )}
                {log.length > 0 && (
                  <Card className="mt-4">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                      Photo log
                    </h3>
                    <PhotoLog entries={log} />
                  </Card>
                )}
              </>
            );
          })()}
        </>
      ) : (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <AiDraftButton
              section={aiSection}
              getData={getAiData}
              existingDraft={draft}
              onInsert={insertAiDraft}
            />
            {aiInserted && (
              <span className="inline-flex items-center gap-2 text-xs text-gray-500">
                <AiDraftBadge /> inserted at cursor — review and edit before
                saving.
              </span>
            )}
          </div>
          <label htmlFor="report-md" className="sr-only">
            Report markdown
          </label>
          <textarea
            id="report-md"
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className={`${inputCls} min-h-[60vh] font-mono text-[13px] leading-relaxed`}
          />
          <p className="mt-1.5 text-xs text-gray-500">
            Drafts are pre-filled by the report generator — edit every word
            before sharing.
          </p>
        </div>
      )}

      {/* Danger zone */}
      <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-red-800">
              Delete this report
            </p>
            <p className="mt-0.5 text-xs text-red-600">
              Removes only this generated report. The assessment and its
              findings stay — you can regenerate the report any time.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDeleting(true)}
            className="min-h-[44px] rounded-lg border border-red-300 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-100"
          >
            🗑 Delete report
          </button>
        </div>
      </div>

      {/* Action bar */}
      <div className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
          <Btn onClick={save} disabled={!dirty} className="flex-1 sm:flex-none">
            💾 Save
          </Btn>
          <Btn variant="ghost" onClick={copy} className="flex-1 sm:flex-none">
            {copied ? "✓ Copied" : "📋 Copy"}
          </Btn>
          <Btn
            variant="ghost"
            className="flex-1 sm:flex-none"
            onClick={() =>
              download(
                `${slug(doc.title || REPORT_LABELS[doc.kind])}.md`,
                draft,
                "text/markdown;charset=utf-8"
              )
            }
          >
            ⬇ Download .md
          </Btn>
          <Link
            href={`/reports/${doc.id}/print`}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:flex-none"
          >
            🖨 Print / PDF
          </Link>
          {!doc.assessmentId.startsWith("group:") && (
            <Btn variant="ghost" className="flex-1 sm:flex-none" onClick={shareHtml} title="One self-contained file — email it; the school opens it in any browser, no account needed.">
              📧 Share HTML
            </Btn>
          )}
          {savedAt && (
            <span className="ml-auto text-xs text-gray-500">
              Saved {savedAt}
              {dirty ? " · unsaved changes" : ""}
            </span>
          )}
        </div>
        {shareMsg && (
          <p className="text-sm font-medium text-red-600" role="alert">
            {shareMsg}
          </p>
        )}
      </div>

      {deleting && (
        <Modal
          title="Delete this report?"
          onClose={() => {
            setDeleting(false);
            setDeleteText("");
          }}
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              This permanently deletes{" "}
              <strong>{doc.title || REPORT_LABELS[doc.kind]}</strong>
              {dirty
                ? ", including your unsaved edits,"
                : ""}{" "}
              — the generated text only. The source assessment, its
              responses, findings, and equipment are not touched, and the
              report can be regenerated from Reports at any time. This
              cannot be undone.
            </p>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Type DELETE to confirm
              </span>
              <input
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                className={`${inputCls} mt-1`}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={deleteText.trim().toUpperCase() !== "DELETE"}
                onClick={() => {
                  deleteReport(doc.id);
                  router.push("/reports");
                }}
                className="min-h-[44px] flex-1 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:px-8"
              >
                Delete permanently
              </button>
              <Btn
                variant="ghost"
                onClick={() => {
                  setDeleting(false);
                  setDeleteText("");
                }}
              >
                Cancel
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
