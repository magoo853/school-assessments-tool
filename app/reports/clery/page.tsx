"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/store";
import type { CleryReport } from "@/lib/store";
import { useMode } from "@/lib/mode";
import { Card, PageHeader, Btn, Badge, Field, inputCls, EmptyState, Modal } from "@/components/ui";
import ProdNotice from "@/components/ProdNotice";
import { blankCleryReport, statsWindow, statsProgress, disclosureProgress } from "@/lib/clery";

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200">
      <div className="h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function CleryListPage() {
  const [mode] = useMode();
  const [reports, setReports] = useState<CleryReport[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [institution, setInstitution] = useState("");
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [preparerName, setPreparerName] = useState("");
  const [preparerTitle, setPreparerTitle] = useState("");

  const refresh = () => {
    setReports(
      db.cleryReports
        .list()
        .sort((a, b) => b.reportYear - a.reportYear || a.institution.localeCompare(b.institution))
    );
  };

  useEffect(refresh, []);

  const createReport = () => {
    if (!institution.trim()) return;
    const year = Number.isFinite(reportYear) ? reportYear : new Date().getFullYear();
    const r = blankCleryReport(institution.trim(), year, preparerName.trim(), preparerTitle.trim());
    db.cleryReports.upsert(r);
    setShowNew(false);
    setInstitution("");
    setPreparerName("");
    setPreparerTitle("");
    refresh();
  };

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <PageHeader
        title="Clery Act ASR Builder"
        subtitle="Annual Security Report builder. An ASR for year Y covers statistics for Y−3 through Y−1."
        actions={
          mode === "demo" ? (
            <Btn onClick={() => setShowNew(true)}>+ New ASR</Btn>
          ) : undefined
        }
      />
      {mode === "prod" && <ProdNotice />}

      {reports.length === 0 ? (
        <EmptyState
          title="No Annual Security Reports yet"
          body={
            mode === "prod"
              ? "Tables are empty in PROD mode — switch to DEMO to work with the builder."
              : "Create your first ASR to start entering crime statistics and tracking the required policy disclosures."
          }
          action={
            mode === "demo" ? (
              <Btn onClick={() => setShowNew(true)}>+ New ASR</Btn>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3">
          {reports.map((r) => {
            const sp = statsProgress(r);
            const dp = disclosureProgress(r);
            const [y1, , y3] = statsWindow(r.reportYear);
            return (
              <Card key={r.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold">{r.institution}</h2>
                      <Badge tone="blue">ASR {r.reportYear}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      Statistics years {y1}–{y3}
                      {r.preparerName ? ` · Prepared by ${r.preparerName}` : ""}
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-medium text-gray-600">
                          Statistics {sp.entered} / {sp.total} cells entered
                        </p>
                        <ProgressBar value={sp.entered} max={sp.total} />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-600">
                          Disclosures {dp.complete} / {dp.required} complete
                        </p>
                        <ProgressBar value={dp.complete} max={dp.required} />
                      </div>
                    </div>
                  </div>
                  <Link href={`/reports/clery/${r.id}`} className="shrink-0">
                    <Btn className="w-full sm:w-auto">Open editor</Btn>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showNew && (
        <Modal title="New Annual Security Report" onClose={() => setShowNew(false)}>
          <div className="grid gap-4">
            <Field label="Institution" hint="Fictional placeholder name for demo work.">
              <input
                className={inputCls}
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="e.g. Harborview College"
              />
            </Field>
            <Field label="Report year" hint={`Statistics will cover ${reportYear - 3}–${reportYear - 1}.`}>
              <input
                className={inputCls}
                type="number"
                min={1990}
                max={2100}
                value={reportYear}
                onChange={(e) => setReportYear(parseInt(e.target.value, 10))}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Preparer name">
                <input
                  className={inputCls}
                  value={preparerName}
                  onChange={(e) => setPreparerName(e.target.value)}
                  placeholder="e.g. J. Rivera"
                />
              </Field>
              <Field label="Preparer title">
                <input
                  className={inputCls}
                  value={preparerTitle}
                  onChange={(e) => setPreparerTitle(e.target.value)}
                  placeholder="e.g. Director of Campus Safety"
                />
              </Field>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Btn variant="ghost" onClick={() => setShowNew(false)}>
                Cancel
              </Btn>
              <Btn onClick={createReport} disabled={!institution.trim()}>
                Create ASR
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
