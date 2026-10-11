"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  db,
  newAssessment,
  type Assessment,
  type AssessmentStatus,
} from "@/lib/store";
import {
  TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  getTemplate,
  templateSize,
} from "@/lib/templates";
import { useMode } from "@/lib/mode";
import ProdNotice from "@/components/ProdNotice";
import {
  Card,
  PageHeader,
  Btn,
  StatusPill,
  Field,
  inputCls,
  EmptyState,
  Modal,
  Badge,
} from "@/components/ui";

function templateName(id: string): string {
  return getTemplate(id).name;
}

/** Last activity: latest response save wins, else completed/created. */
function updatedAt(a: Assessment): string {
  let latest = a.completedAt && a.completedAt > a.createdAt ? a.completedAt : a.createdAt;
  for (const r of db.responses.filter((x) => x.assessmentId === a.id)) {
    const parts = r.id.split("_");
    if (parts.length >= 3) {
      const t = parseInt(parts[1], 36);
      if (!Number.isNaN(t)) {
        const iso = new Date(t).toISOString();
        if (iso > latest) latest = iso;
      }
    }
  }
  return latest;
}

function progress(a: Assessment): { answered: number; total: number } {
  const total = templateSize(getTemplate(a.templateId));
  const answered = db.responses.filter(
    (r) => r.assessmentId === a.id && r.answer !== null
  ).length;
  return { answered, total };
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function NewAssessmentModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [clientName, setClientName] = useState("");
  const [campus, setCampus] = useState("Main campus");
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [leadId, setLeadId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [escort, setEscort] = useState("");
  const [weather, setWeather] = useState("");
  const [focusNotes, setFocusNotes] = useState("");
  const assessors = db.assessors.list();

  const create = () => {
    if (!clientName.trim()) return;
    const lead = leadId ? db.assessors.get(leadId) : undefined;
    const a = newAssessment({
      clientName: clientName.trim(),
      campus: campus.trim() || "Main campus",
      templateId,
      assessorIds: lead ? [lead.id] : [],
      leadAssessorId: lead?.id,
      focusNotes: focusNotes.trim(),
      status: "in_progress",
      cover: {
        date,
        assessors: lead?.name ?? "",
        escort: escort.trim(),
        weather: weather.trim(),
      },
    });
    db.assessments.upsert(a);
    router.push(`/assessments/${a.id}`);
  };

  return (
    <Modal title="New assessment" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Client (school / district)">
          <input
            className={inputCls}
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="e.g. Sample Elementary School"
            autoFocus
          />
        </Field>
        <Field label="Campus">
          <input
            className={inputCls}
            value={campus}
            onChange={(e) => setCampus(e.target.value)}
            placeholder="Main campus"
          />
        </Field>
        <Field label="Template">
          <select
            className={inputCls}
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            {getTemplate(templateId).description}
          </p>
        </Field>
        <Field label="Lead assessor">
          <select
            className={inputCls}
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
          >
            <option value="">Unassigned</option>
            {assessors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.title ? ` — ${a.title}` : ""}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Assessment date">
            <input
              type="date"
              className={inputCls}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="School escort">
            <input
              className={inputCls}
              value={escort}
              onChange={(e) => setEscort(e.target.value)}
              placeholder="Name of escort"
            />
          </Field>
        </div>
        <Field label="Weather / conditions">
          <input
            className={inputCls}
            value={weather}
            onChange={(e) => setWeather(e.target.value)}
            placeholder="e.g. Clear, 78°F"
          />
        </Field>
        <Field label="Focus notes">
          <textarea
            className={`${inputCls} min-h-[88px]`}
            value={focusNotes}
            onChange={(e) => setFocusNotes(e.target.value)}
            placeholder="Areas of special focus for this visit…"
          />
        </Field>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn onClick={create} disabled={!clientName.trim()}>
            Start walkthrough
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

export default function AssessmentsPage() {
  return (
    <Suspense>
      <AssessmentsInner />
    </Suspense>
  );
}

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
];

function AssessmentsInner() {
  const [mode] = useMode();
  const [showNew, setShowNew] = useState(false);
  const [, setTick] = useState(0);
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status");
  const [statusFilter, setStatusFilter] = useState<string>(
    initialStatus && ["draft", "in_progress", "completed"].includes(initialStatus)
      ? initialStatus
      : "all"
  );

  useEffect(() => {
    setTick((t) => t + 1);
  }, []);

  const assessments = db.assessments
    .list()
    .filter((a: Assessment) =>
      statusFilter === "all" ? true : a.status === (statusFilter as AssessmentStatus)
    )
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));

  return (
    <div>
      <PageHeader
        title="Assessments"
        subtitle="Walkthrough assessments by client and campus."
        actions={
          <Btn onClick={() => setShowNew(true)}>+ New assessment</Btn>
        }
      />
      {mode === "prod" && <ProdNotice />}

      {/* Status filter chips — also the drill-down target for dashboard stats */}
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatusFilter(f.key)}
            aria-pressed={statusFilter === f.key}
            className={`flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold transition-all ${
              statusFilter === f.key
                ? "bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-[0_4px_14px_-4px_rgba(124,58,237,0.6)]"
                : "border border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {assessments.length === 0 ? (
        <EmptyState
          title={mode === "prod" ? "No assessments yet" : statusFilter === "all" ? "No assessments yet" : "Nothing here"}
          body={
            mode === "prod"
              ? "The live database is not connected, so no assessments are stored here."
              : statusFilter === "all"
                ? "Start your first walkthrough — pick a template, assign a lead assessor, and go."
                : `No ${STATUS_FILTERS.find((f) => f.key === statusFilter)?.label.toLowerCase()} assessments.`
          }
          action={<Btn onClick={() => setShowNew(true)}>+ New assessment</Btn>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {assessments.map((a) => {
            const p = progress(a);
            const pct = p.total ? Math.round((p.answered / p.total) * 100) : 0;
            return (
              <Link key={a.id} href={`/assessments/${a.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">
                        {a.clientName}
                      </p>
                      <p className="truncate text-sm text-gray-500">{a.campus}</p>
                    </div>
                    <StatusPill status={a.status} />
                  </div>
                  <div className="mt-3">
                    <Badge tone="blue">{templateName(a.templateId)}</Badge>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>
                        {p.answered} / {p.total} checkpoints
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bar-gradient transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-gray-400">
                    Updated {fmtDate(updatedAt(a))}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {showNew && <NewAssessmentModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
