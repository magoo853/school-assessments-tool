"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { db, nowIso, type ReportDoc } from "@/lib/store";
import { useMode } from "@/lib/mode";
import { Btn, Card, EmptyState, PageHeader, inputCls } from "@/components/ui";
import ProdNotice from "@/components/ProdNotice";
import { REPORT_LABELS, download, slug } from "@/lib/reports";
import AiDraftButton, { AiDraftBadge } from "@/components/AiDraftButton";
import type { DraftSection } from "@/lib/draft";

/* ── Tiny markdown renderer (~60 lines): headings, bold, lists, tables, hr.
 * No dependencies. Handles the flat markdown this app generates. ── */

function inlineMd(text: string, key: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
      <strong key={`${key}-${i}`}>{p.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={`${key}-${i}`}>{p}</React.Fragment>
    )
  );
}

function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let k = 0;
  const flushPara = (buf: string[]) => {
    if (!buf.length) return;
    const key = k++;
    out.push(
      <p key={key} className="my-2 text-[15px] leading-relaxed text-gray-800">
        {inlineMd(buf.join(" "), `p${key}`)}
      </p>
    );
    buf.length = 0;
  };
  const cells = (r: string) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  let i = 0;
  let para: string[] = [];
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { flushPara(para); i++; continue; }
    if (line.startsWith("|") && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
      flushPara(para);
      const head = cells(line); i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(cells(lines[i])); i++; }
      const key = k++;
      out.push(
        <div key={key} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr>{head.map((h, j) => <th key={j} className="border border-gray-300 bg-gray-50 px-3 py-2 text-left font-semibold">{inlineMd(h, `th${key}${j}`)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci} className="border border-gray-200 px-3 py-2 align-top text-gray-800">{inlineMd(c, `td${key}${ri}${ci}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      flushPara(para);
      const lvl = h[1].length, key = k++;
      const cls = lvl === 1 ? "mb-3 mt-1 text-2xl font-bold" : lvl === 2 ? "mb-2 mt-6 border-b border-gray-100 pb-1 text-xl font-bold" : lvl === 3 ? "mb-1 mt-4 text-base font-bold" : "mb-1 mt-3 text-sm font-bold";
      out.push(React.createElement(`h${lvl}`, { key, className: cls }, inlineMd(h[2], `h${key}`)));
      i++; continue;
    }
    if (/^---+$/.test(line)) { flushPara(para); out.push(<hr key={k++} className="my-4 border-gray-200" />); i++; continue; }
    const ulm = line.match(/^[-*]\s+(.*)/);
    const olm = line.match(/^\d+[.)]\s+(.*)/);
    if (ulm || olm) {
      flushPara(para);
      const ordered = !!olm, items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].trim().match(ordered ? /^\d+[.)]\s+(.*)/ : /^[-*]\s+(.*)/);
        if (!m) break;
        items.push(m[1]); i++;
      }
      const key = k++;
      const Tag = ordered ? "ol" : "ul";
      out.push(React.createElement(Tag, { key, className: `${ordered ? "list-decimal" : "list-disc"} my-2 space-y-1.5 pl-6 text-[15px] leading-relaxed text-gray-800` },
        items.map((it, j) => <li key={j}>{inlineMd(it, `l${key}${j}`)}</li>)));
      continue;
    }
    para.push(line); i++;
  }
  flushPara(para);
  return <div>{out}</div>;
}

/* ── Page ── */

export default function ReportViewPage() {
  const params = useParams();
  const id = params.id as string;
  const [mode] = useMode();
  const [doc, setDoc] = useState<ReportDoc | null>(null);
  const [draft, setDraft] = useState("");
  const [tab, setTab] = useState<"preview" | "edit">("preview");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [aiInserted, setAiInserted] = useState(false);
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
            date: a.cover.date,
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

  if (mode === "prod") {
    return (
      <div>
        <PageHeader title="Report" />
        <ProdNotice />
        <EmptyState
          title="No report in prod yet"
          body="The live database is not connected. Switch to demo mode to view generated reports."
        />
      </div>
    );
  }

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
        <Card className="prose-none">{renderMarkdown(draft)}</Card>
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
          {savedAt && (
            <span className="ml-auto text-xs text-gray-500">
              Saved {savedAt}
              {dirty ? " · unsaved changes" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
