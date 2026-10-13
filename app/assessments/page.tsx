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
  DEFAULT_TEMPLATE_ID,
  templateSize,
} from "@/lib/templates";
import { resolveTemplate, allTemplates } from "@/lib/customTemplates";
import { useMode } from "@/lib/mode";
import ProdNotice from "@/components/ProdNotice";
import TemplatePickerModal from "@/components/TemplatePickerModal";
import ReassessModal from "@/components/ReassessModal";
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
  return resolveTemplate(id).name;
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
  const total = templateSize(resolveTemplate(a.templateId));
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
  const templates = allTemplates();

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
            {templates.map(({ template: t, custom }) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {custom ? " (custom)" : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            {resolveTemplate(templateId).description}
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
  const [switchTarget, setSwitchTarget] = useState<Assessment | null>(null);
  const [reassessTarget, setReassessTarget] = useState<Assessment | null>(null);
  const router = useRouter();
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
              <Card key={a.id} className="relative transition-shadow hover:shadow-md">
                {/* Stretched link: the whole card opens the assessment,
                    while the Change button stays tappable above it. */}
                <Link
                  href={`/assessments/${a.id}`}
                  className="absolute inset-0 z-0 rounded-2xl"
                  aria-label={`Open ${a.clientName} assessment`}
                />
                <div className="relative z-10 pointer-events-none">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">
                        {a.clientName}
                      </p>
                      <p className="truncate text-sm text-gray-500">{a.campus}</p>
                    </div>
                    <StatusPill status={a.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge tone="blue">{templateName(a.templateId)}</Badge>
                    {a.review?.state === "pending" && (
                      <Badge tone="amber">⏳ In review</Badge>
                    )}
                    {a.review?.state === "approved" && (
                      <Badge tone="green">✓ Approved</Badge>
                    )}
                    {a.review?.state === "sent_back" && (
                      <Badge tone="red">↩ Sent back</Badge>
                    )}
                    <button
                      type="button"
                      onClick={() => setSwitchTarget(a)}
                      className="pointer-events-auto inline-flex min-h-[36px] items-center rounded-full border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:border-violet-400 hover:text-violet-700"
                    >
                      ⇄ Change template
                    </button>
                    {a.status === "completed" && (
                      <button
                        type="button"
                        onClick={() => setReassessTarget(a)}
                        className="pointer-events-auto inline-flex min-h-[36px] items-center rounded-full border border-emerald-300 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition-colors hover:border-emerald-500 hover:text-emerald-800"
                      >
                        ↻ Reassess
                      </button>
                    )}
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
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showNew && <NewAssessmentModal onClose={() => setShowNew(false)} />}
      {switchTarget && (
        <TemplatePickerModal
          assessment={switchTarget}
          onClose={() => setSwitchTarget(null)}
          onChanged={() => setTick((t) => t + 1)}
        />
      )}
      {reassessTarget && (
        <ReassessModal
          source={reassessTarget}
          onClose={() => setReassessTarget(null)}
          onCreated={(id) => router.push(`/assessments/${id}`)}
        />
      )}
    </div>
  );
}
