"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/store";
import type { CleryReport, CleryStatRow } from "@/lib/store";
import { useMode } from "@/lib/mode";
import { Card, PageHeader, Btn, Badge, Field, inputCls, EmptyState, Modal } from "@/components/ui";
import ProdNotice from "@/components/ProdNotice";
import {
  GEOS,
  OFFENSE_GROUPS,
  DISCLOSURES,
  disclosureRequired,
  statsWindow,
  statsProgress,
  disclosureProgress,
  generateAsrMarkdown,
  healDisclosures,
} from "@/lib/clery";

/* ---------- tiny local markdown renderer (headings, bold, lists, tables) ---------- */

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s: string): string {
  let out = escHtml(s);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\[x\]/gi, "☑");
  out = out.replace(/\[ \]/g, "☐");
  return out;
}

function renderTable(rows: string[][]): string {
  const [head, ...body] = rows;
  const th = head.map((c) => `<th class="border border-gray-300 bg-gray-50 px-2 py-1.5 text-left text-xs font-semibold">${inline(c)}</th>`).join("");
  const tb = body
    .map(
      (r) =>
        `<tr>${r
          .map((c) => `<td class="border border-gray-300 px-2 py-1.5 text-xs">${inline(c)}</td>`)
          .join("")}</tr>`
    )
    .join("");
  return `<div class="overflow-x-auto my-3"><table class="w-full border-collapse"><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`;
}

function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let tableBuf: string[][] | null = null;
  let listBuf: string[] | null = null;

  const flushTable = () => {
    if (tableBuf && tableBuf.length > 0) out.push(renderTable(tableBuf));
    tableBuf = null;
  };
  const flushList = () => {
    if (listBuf && listBuf.length > 0) out.push(`<ul class="my-2 list-disc space-y-1 pl-5 text-sm">${listBuf.join("")}</ul>`);
    listBuf = null;
  };

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("|")) {
      flushList();
      const cells = t.split("|").slice(1, -1).map((c) => c.trim());
      if (/^:?-+:?$/.test(cells[0] ?? "")) continue; // separator row
      if (!tableBuf) tableBuf = [];
      tableBuf.push(cells);
      continue;
    }
    flushTable();
    if (t.startsWith("### ")) {
      flushList();
      out.push(`<h3 class="mt-4 text-base font-bold">${inline(t.slice(4))}</h3>`);
    } else if (t.startsWith("## ")) {
      flushList();
      out.push(`<h2 class="mt-5 text-lg font-bold">${inline(t.slice(3))}</h2>`);
    } else if (t.startsWith("# ")) {
      flushList();
      out.push(`<h1 class="text-xl font-bold">${inline(t.slice(2))}</h1>`);
    } else if (t.startsWith("- ") || t.startsWith("* ")) {
      if (!listBuf) listBuf = [];
      listBuf.push(`<li>${inline(t.slice(2))}</li>`);
    } else if (t.startsWith("> ")) {
      flushList();
      out.push(`<p class="my-2 border-l-4 border-gray-300 pl-3 text-sm text-gray-600">${inline(t.slice(2))}</p>`);
    } else if (t === "") {
      flushList();
    } else {
      flushList();
      out.push(`<p class="my-1 text-sm">${inline(t)}</p>`);
    }
  }
  flushTable();
  flushList();
  return out.join("\n");
}

/* ---------- numeric cell with explicit confirm-genuine-zero ---------- */

function StatCell({
  row,
  onCommit,
}: {
  row: CleryStatRow;
  onCommit: (rowId: string, value: number | null, confirmedZero: boolean) => void;
}) {
  const [text, setText] = useState(row.value === null ? "" : String(row.value));

  useEffect(() => {
    setText(row.value === null ? "" : String(row.value));
  }, [row.value]);

  const commit = () => {
    const t = text.trim();
    if (t === "") {
      onCommit(row.id, null, false);
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n)) {
      setText(row.value === null ? "" : String(row.value));
      return;
    }
    const v = Math.max(0, Math.floor(n));
    if (v === 0) {
      // Leave the "0" typed in the box and let the parent open the confirm step.
      onCommit(row.id, 0, false);
    } else {
      onCommit(row.id, v, false);
    }
  };

  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      className={`${inputCls} text-center ${row.confirmedZero ? "border-green-500 bg-green-50" : ""}`}
      style={{ minWidth: 64 }}
      value={text}
      title={
        row.confirmedZero
          ? "Confirmed zero — institution verified no incidents"
          : row.value === null
            ? "Not entered"
            : undefined
      }
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      aria-label={`${row.offense} — ${row.geo} ${row.year}`}
    />
  );
}

/* ---------- editor page ---------- */

export default function CleryEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [mode] = useMode();
  const [report, setReport] = useState<CleryReport | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const [pendingZero, setPendingZero] = useState<{ rowId: string; label: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const r = db.cleryReports.get(params.id);
    // Normalize on load: a report restored from an older backup may be
    // missing its stats array — default it instead of crashing the editor.
    // Heal legacy disclosure keys (early seed key set): without this the
    // disclosure checkboxes render dead — toggles match rows by current
    // key and find nothing to change.
    if (r) {
      const healed = healDisclosures(r);
      const normalized = {
        ...r,
        stats: Array.isArray(r.stats) ? r.stats : [],
      };
      if (healed || !Array.isArray(r.stats)) db.cleryReports.upsert(normalized);
      setReport(normalized);
      setYear(statsWindow(r.reportYear)[2]);
    } else {
      setReport(null);
    }
    setLoaded(true);
  }, [params.id]);

  const rowIndex = useMemo(() => {
    const m = new Map<string, CleryStatRow>();
    report?.stats.forEach((s) => {
      m.set(`${s.year}|${s.group}|${s.offense}|${s.geo}`, s);
    });
    return m;
  }, [report]);

  const update = (next: CleryReport) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    setReport(stamped);
    db.cleryReports.upsert(stamped);
  };

  const handleCellCommit = (rowId: string, value: number | null, confirmedZero: boolean) => {
    if (!report) return;
    if (value === 0 && !confirmedZero) {
      const row = report.stats.find((s) => s.id === rowId);
      if (row) {
        setPendingZero({
          rowId,
          label: `${row.offense} — ${row.year} (${row.geo})`,
        });
      }
      return;
    }
    update({
      ...report,
      stats: report.stats.map((s) =>
        s.id === rowId ? { ...s, value, confirmedZero } : s
      ),
    });
  };

  const resolveZero = (confirm: boolean) => {
    if (!report || !pendingZero) {
      setPendingZero(null);
      return;
    }
    if (confirm) {
      update({
        ...report,
        stats: report.stats.map((s) =>
          s.id === pendingZero.rowId ? { ...s, value: 0, confirmedZero: true } : s
        ),
      });
    } else {
      // leave unentered
      update({
        ...report,
        stats: report.stats.map((s) =>
          s.id === pendingZero.rowId ? { ...s, value: null, confirmedZero: false } : s
        ),
      });
    }
    setPendingZero(null);
  };

  const toggleDisclosure = (key: string, complete: boolean) => {
    if (!report) return;
    update({
      ...report,
      disclosures: report.disclosures.map((d) =>
        d.key === key ? { ...d, complete } : d
      ),
    });
  };

  const setDisclosureNote = (key: string, note: string) => {
    if (!report) return;
    update({
      ...report,
      disclosures: report.disclosures.map((d) =>
        d.key === key ? { ...d, note } : d
      ),
    });
  };

  const downloadMd = () => {
    if (!report) return;
    const md = generateAsrMarkdown(report);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `asr-${report.reportYear}-${report.institution
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const copyMd = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(generateAsrMarkdown(report));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (!loaded) {
    // First paint before the device read lands — don't flash
    // "ASR not found" for a report that exists.
    return (
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        <EmptyState
          title="ASR not found"
          body="This report may have been deleted."
          action={
            <Link href="/reports/clery">
              <Btn>Back to ASR list</Btn>
            </Link>
          }
        />
      </div>
    );
  }

  const years = statsWindow(report.reportYear);
  const sp = statsProgress(report);
  const dp = disclosureProgress(report);
  const activeYear = year ?? years[2];

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      {mode === "prod" && <ProdNotice />}
      <PageHeader
        title={`${report.institution} — ASR ${report.reportYear}`}
        subtitle={`Statistics cover ${years[0]}–${years[2]}. Unentered cells print as —, never 0.`}
        actions={
          <>
            <Link href="/reports/clery">
              <Btn variant="ghost">← All ASRs</Btn>
            </Link>
            <Btn onClick={() => setPreview(generateAsrMarkdown(report))}>
              Generate ASR preview
            </Btn>
          </>
        }
      />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-600">Statistics</span>
            <Badge tone={sp.entered === sp.total ? "green" : "blue"}>
              {sp.entered} / {sp.total}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-600">Disclosures</span>
            <Badge tone={dp.complete === dp.required ? "green" : "yellow"}>
              {dp.complete} / {dp.required}
            </Badge>
          </div>
          <div className="text-sm text-gray-500 sm:text-right">
            {report.preparerName
              ? `Preparer: ${report.preparerName}${report.preparerTitle ? `, ${report.preparerTitle}` : ""}`
              : "No preparer listed"}
          </div>
        </div>
      </Card>

      {/* year tabs */}
      <div className="mb-4 flex gap-2" role="tablist" aria-label="Statistics year">
        {years.map((y) => (
          <button
            key={y}
            role="tab"
            aria-selected={activeYear === y}
            onClick={() => setYear(y)}
            className={`min-h-[44px] flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold sm:flex-none sm:px-6 ${
              activeYear === y
                ? "border-blue-600 bar-gradient text-white"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {/* stats grid */}
      <div className="space-y-3">
        {OFFENSE_GROUPS.map((group) => (
          <details key={group.key} className="group rounded-xl border border-gray-200 bg-white shadow-sm" open={group.key === "criminal"}>
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between px-4 py-3 font-semibold">
              <span>{group.label}</span>
              <span className="text-gray-400 group-open:rotate-90">▶</span>
            </summary>
            <div className="border-t border-gray-100 px-4 pb-4">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr>
                      <th className="sticky left-0 bg-white px-2 py-2 text-left text-xs font-semibold text-gray-600">
                        Offense
                      </th>
                      {GEOS.map((g) => (
                        <th key={g.key} className="px-2 py-2 text-center text-xs font-semibold text-gray-600">
                          {g.short}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.offenses.map((offense) => (
                      <tr key={offense.key} className="border-t border-gray-100">
                        <td className="sticky left-0 bg-white px-2 py-2 text-sm">{offense.label}</td>
                        {GEOS.map((geo) => {
                          const row = rowIndex.get(`${activeYear}|${group.label}|${offense.label}|${geo.key}`);
                          return (
                            <td key={geo.key} className="px-1 py-1.5">
                              {row ? (
                                <StatCell row={row} onCommit={handleCellCommit} />
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Typing 0 asks for explicit confirmation before it is recorded. Green cells are confirmed zeros.
              </p>
            </div>
          </details>
        ))}
      </div>

      {/* disclosures checklist */}
      <Card className="mt-6">
        <h2 className="mb-1 text-lg font-bold">Required policy disclosure statements</h2>
        <p className="mb-4 text-sm text-gray-500">
          Track which statements are drafted for the ASR narrative. Checked items appear as ☑ in the generated report.
        </p>
        <div className="space-y-3">
          {DISCLOSURES.map((def) => {
            const d = report.disclosures.find((x) => x.key === def.key);
            const required = disclosureRequired(def, report.reportYear);
            const checked = d?.complete ?? false;
            return (
              <div key={def.key} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-6 w-6 shrink-0 accent-violet-600"
                    checked={checked}
                    onChange={(e) => toggleDisclosure(def.key, e.target.checked)}
                    aria-label={def.label}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{def.label}</span>
                      {def.requiredFromYear && (
                        <Badge tone="blue">Required from {def.requiredFromYear} ASR</Badge>
                      )}
                      {!required && <Badge tone="gray">Optional this year</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">{def.hint}</p>
                    <input
                      className={`${inputCls} mt-2`}
                      placeholder="Note (optional — e.g. draft section or page reference)"
                      value={d?.note ?? ""}
                      onChange={(e) => setDisclosureNote(def.key, e.target.value)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* danger zone */}
      <div className="mt-6 flex justify-end">
        <Btn variant="danger" onClick={() => setConfirmDelete(true)}>
          Delete this ASR
        </Btn>
      </div>

      {/* confirm genuine zero */}
      {pendingZero && (
        <Modal title="Confirm genuine zero" onClose={() => resolveZero(false)}>
          <p className="text-sm text-gray-700">
            You entered <strong>0</strong> for:
          </p>
          <p className="mt-2 rounded-lg bg-gray-50 p-3 text-sm font-semibold">{pendingZero.label}</p>
          <p className="mt-3 text-sm text-gray-600">
            A 0 in the published ASR means the institution verified there were <em>no</em> such
            incidents. If you simply haven't entered data yet, leave it unentered — it will print as —.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Btn variant="ghost" onClick={() => resolveZero(false)}>
              Leave unentered (—)
            </Btn>
            <Btn onClick={() => resolveZero(true)}>Confirm genuine zero</Btn>
          </div>
        </Modal>
      )}

      {/* ASR preview */}
      {preview !== null && (
        <Modal title={`ASR preview — ${report.institution} (${report.reportYear})`} onClose={() => setPreview(null)}>
          <div className="flex flex-wrap gap-2">
            <Btn onClick={downloadMd}>Download .md</Btn>
            <Btn variant="ghost" onClick={copyMd}>
              {copied ? "Copied ✓" : "Copy"}
            </Btn>
          </div>
          <div
            className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4"
            dangerouslySetInnerHTML={{ __html: mdToHtml(preview) }}
          />
        </Modal>
      )}

      {/* delete confirm */}
      {confirmDelete && (
        <Modal title="Delete this ASR?" onClose={() => setConfirmDelete(false)}>
          <p className="text-sm text-gray-700">
            This permanently deletes the {report.institution} {report.reportYear} ASR, including all
            entered statistics and disclosures. This cannot be undone.
          </p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Btn variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Btn>
            <Btn
              variant="danger"
              onClick={() => {
                db.cleryReports.remove(report.id);
                router.push("/reports/clery");
              }}
            >
              Delete permanently
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
