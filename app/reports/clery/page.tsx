"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/store";
import type { CleryReport } from "@/lib/store";
import { useMode } from "@/lib/mode";
import { Card, PageHeader, Btn, Badge, Field, inputCls, EmptyState, Modal, BackLink } from "@/components/ui";
import ProdNotice from "@/components/ProdNotice";
import { blankCleryReport, statsWindow, statsProgress, disclosureProgress } from "@/lib/clery";
import {
  knownSchools,
  priorAsrFor,
  autofillDisclosures,
  preparerDefaults,
} from "@/lib/cleryAutofill";

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200">
      <div className="h-full rounded-full bar-gradient" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function CleryListPage() {
  const [mode] = useMode();
  const [reports, setReports] = useState<CleryReport[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [institution, setInstitution] = useState("");
  const [schools, setSchools] = useState<string[]>([]);
  const [schoolChoice, setSchoolChoice] = useState("");
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [preparerName, setPreparerName] = useState("");
  const [preparerTitle, setPreparerTitle] = useState("");
  const [lastCreated, setLastCreated] = useState<{
    institution: string;
    filledFrom: string[];
  } | null>(null);

  const refresh = () => {
    setReports(
      db.cleryReports
        .list()
        .sort((a, b) => b.reportYear - a.reportYear || a.institution.localeCompare(b.institution))
    );
    setSchools(knownSchools());
  };

  useEffect(refresh, []);

  /** Open the New ASR form with the preparer prefilled from My
   *  Profile (or the school's last ASR once one is picked). */
  const openNew = () => {
    const d = preparerDefaults("");
    setPreparerName(d.name);
    setPreparerTitle(d.title);
    setInstitution("");
    setSchoolChoice("");
    setLastCreated(null);
    refresh();
    setShowNew(true);
  };

  const pickSchool = (choice: string) => {
    setSchoolChoice(choice);
    if (choice === "__new") {
      setInstitution("");
      return;
    }
    setInstitution(choice);
    const d = preparerDefaults(choice);
    if (d.name) setPreparerName(d.name);
    if (d.title) setPreparerTitle(d.title);
  };

  const createReport = () => {
    if (!institution.trim()) return;
    const year = Number.isFinite(reportYear) ? reportYear : new Date().getFullYear();
    const r = blankCleryReport(institution.trim(), year, preparerName.trim(), preparerTitle.trim());
    const auto = autofillDisclosures(institution.trim(), r.disclosures);
    r.disclosures = auto.disclosures;
    db.cleryReports.upsert(r);
    setShowNew(false);
    setInstitution("");
    setSchoolChoice("");
    setPreparerName("");
    setPreparerTitle("");
    setLastCreated(
      auto.filledFrom.length
        ? { institution: r.institution, filledFrom: auto.filledFrom }
        : null
    );
    refresh();
  };

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <BackLink href="/reports" label="Reports" />
      <PageHeader
        title="Clery Act ASR Builder"
        subtitle="Annual Security Report builder. An ASR for year Y covers statistics for Y−3 through Y−1."
        actions={<Btn onClick={openNew}>+ New ASR</Btn>}
      />
      {mode === "prod" && <ProdNotice />}
      {lastCreated && (
        <Card className="mb-4 border-emerald-200 bg-emerald-50">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-emerald-900">
                ASR created for {lastCreated.institution} — started from
                what the app already knows:
              </p>
              <ul className="mt-1 list-disc pl-5 text-sm text-emerald-800">
                {lastCreated.filledFrom.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-emerald-700">
                Review the filled statements in the editor — statistics
                are never autofilled and still need entry.
              </p>
            </div>
            <Btn variant="ghost" onClick={() => setLastCreated(null)}>
              Dismiss
            </Btn>
          </div>
        </Card>
      )}

      {reports.length === 0 ? (
        <EmptyState
          title="No Annual Security Reports yet"
          body="Create your first ASR to start entering crime statistics and tracking the required policy disclosures."
          action={<Btn onClick={() => setShowNew(true)}>+ New ASR</Btn>}
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
            {schools.length > 0 && (
              <Field
                label="School"
                hint="Schools the app already knows — from assessments, the schedule, and past ASRs."
              >
                <select
                  className={inputCls}
                  value={schoolChoice}
                  onChange={(e) => pickSchool(e.target.value)}
                >
                  <option value="">Select a school…</option>
                  {schools.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                  <option value="__new">➕ New school (type the name)</option>
                </select>
              </Field>
            )}
            {(schools.length === 0 || schoolChoice === "__new" || schoolChoice === "") && (
              <Field label="Institution" hint="Fictional placeholder name for demo work.">
                <input
                  className={inputCls}
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="e.g. Harborview College"
                />
              </Field>
            )}
            {schoolChoice !== "" &&
              schoolChoice !== "__new" &&
              (() => {
                const prior = priorAsrFor(schoolChoice);
                return prior ? (
                  <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-800">
                    This school filed an ASR {prior.reportYear} — its
                    disclosure statements and preparer will carry
                    forward. Anything the policy library covers fills
                    the rest. Statistics are never autofilled.
                  </p>
                ) : (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    No past ASR for this school — disclosures the
                    policy library covers will be filled from it.
                    Statistics are never autofilled.
                  </p>
                );
              })()}
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
