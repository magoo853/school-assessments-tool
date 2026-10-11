"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db, newAssessment, uid, type ScheduleItem } from "@/lib/store";
import { useMode } from "@/lib/mode";
import {
  Badge,
  Btn,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  StatusPill,
  inputCls,
} from "@/components/ui";
import ProdNotice from "@/components/ProdNotice";
import { AssessorCompact, AssessorUnassigned } from "@/components/AssessorCard";
import ScheduleCalendar from "@/components/ScheduleCalendar";
import { getReassessment } from "@/lib/schedule";

const TEMPLATES = [
  { id: "isc42", label: "42-Point ISC-Aligned Walkthrough" },
  { id: "fl-fssat", label: "Florida School Safety Assessment Tool (FSSAT)" },
  { id: "la", label: "Louisiana 116-Question Template" },
];

function templateLabel(id: string): string {
  return TEMPLATES.find((t) => t.id === id)?.label ?? id;
}

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const ADVANCE: Record<string, { next: ScheduleItem["status"]; label: string } | null> = {
  scheduled: { next: "in_progress", label: "Mark in progress" },
  in_progress: { next: "completed", label: "Mark completed" },
  completed: null,
  cancelled: null,
};

/* ---------------- Schedule form (create / edit) ---------------- */

function ScheduleForm({
  initial,
  onClose,
}: {
  initial?: ScheduleItem;
  onClose: () => void;
}) {
  const [clientName, setClientName] = useState(initial?.clientName ?? "");
  const [campus, setCampus] = useState(initial?.campus ?? "");
  const [date, setDate] = useState(initial?.date ?? todayLocal());
  const [templateId, setTemplateId] = useState(initial?.templateId ?? "isc42");
  const [assessorId, setAssessorId] = useState(initial?.assessorId ?? "");
  const [focusNotes, setFocusNotes] = useState(initial?.focusNotes ?? "");
  const [error, setError] = useState("");
  const assessors = useMemo(() => db.assessors.list(), []);

  const save = () => {
    if (!clientName.trim()) {
      setError("Client name is required.");
      return;
    }
    if (!date) {
      setError("Date is required.");
      return;
    }
    db.schedules.upsert({
      id: initial?.id ?? uid("sch"),
      clientName: clientName.trim(),
      campus: campus.trim(),
      date,
      templateId,
      assessorId: assessorId || undefined,
      focusNotes: focusNotes.trim(),
      status: initial?.status ?? "scheduled",
      assessmentId: initial?.assessmentId,
    });
    onClose();
  };

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <Field label="Client name">
        <input
          className={inputCls}
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="e.g. Magnolia Parish High School"
          autoFocus
        />
      </Field>
      <Field label="Campus">
        <input
          className={inputCls}
          value={campus}
          onChange={(e) => setCampus(e.target.value)}
          placeholder="e.g. Main campus"
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Date">
          <input
            type="date"
            className={inputCls}
            value={date}
            onChange={(e) => setDate(e.target.value)}
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
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Assigned assessor">
        <select
          className={inputCls}
          value={assessorId}
          onChange={(e) => setAssessorId(e.target.value)}
        >
          <option value="">Unassigned</option>
          {assessors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Focus notes">
        <textarea
          className={`${inputCls} min-h-[88px]`}
          value={focusNotes}
          onChange={(e) => setFocusNotes(e.target.value)}
          placeholder="Scope notes, areas to prioritize, access instructions…"
        />
      </Field>
      <div className="flex flex-wrap gap-2 pt-1">
        <Btn onClick={save} className="flex-1 sm:flex-none sm:px-8">
          {initial ? "Save changes" : "Schedule assessment"}
        </Btn>
        <Btn variant="ghost" onClick={onClose}>
          Cancel
        </Btn>
      </div>
    </div>
  );
}

/* ---------------- Dispatch board row ---------------- */

function ScheduleRow({
  item,
  onChanged,
}: {
  item: ScheduleItem;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const assessor = item.assessorId
    ? db.assessors.get(item.assessorId)
    : undefined;
  const overdue = item.status === "scheduled" && item.date < todayLocal();
  const advance = ADVANCE[item.status];

  const advanceStatus = () => {
    if (!advance) return;
    db.schedules.upsert({ ...item, status: advance.next });
    onChanged();
  };

  const cancel = () => {
    if (!window.confirm(`Cancel the scheduled visit for ${item.clientName}?`)) return;
    db.schedules.upsert({ ...item, status: "cancelled" });
    onChanged();
  };

  const reactivate = () => {
    db.schedules.upsert({ ...item, status: "scheduled" });
    onChanged();
  };

  const remove = () => {
    if (!window.confirm(`Delete the schedule entry for ${item.clientName} on ${fmtDate(item.date)}?`))
      return;
    db.schedules.remove(item.id);
    onChanged();
  };

  const startWalkthrough = () => {
    const assessment = newAssessment({
      clientName: item.clientName,
      campus: item.campus || "Main campus",
      templateId: item.templateId,
      assessorIds: item.assessorId ? [item.assessorId] : [],
      scheduledId: item.id,
      focusNotes: item.focusNotes,
      status: "in_progress",
    });
    db.assessments.upsert(assessment);
    db.schedules.upsert({
      ...item,
      assessmentId: assessment.id,
      status: "in_progress",
    });
    router.push(`/assessments/${assessment.id}`);
  };

  return (
    <>
      <li className="border-b border-gray-100 px-4 py-4 last:border-0 md:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900">{item.clientName}</p>
            <p className="mt-0.5 text-sm text-gray-500">
              {item.campus ? `${item.campus} · ` : ""}
              {fmtDate(item.date)}
            </p>
            <p className="mt-0.5 text-sm text-gray-500">
              {templateLabel(item.templateId)}
            </p>
            <div className="mt-2">
              {assessor ? (
                <AssessorCompact assessor={assessor} />
              ) : (
                <AssessorUnassigned />
              )}
            </div>
            {item.focusNotes && (
              <p className="mt-1 line-clamp-2 text-sm text-gray-600">{item.focusNotes}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={item.status} />
            {overdue && <Badge tone="red">Overdue</Badge>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {item.status === "scheduled" && (
            <Btn onClick={startWalkthrough} className="sm:w-auto">
              ▶ Start walkthrough
            </Btn>
          )}
          {item.assessmentId && item.status !== "cancelled" && (
            <Btn
              variant="ghost"
              onClick={() => router.push(`/assessments/${item.assessmentId}`)}
            >
              Open assessment
            </Btn>
          )}
          {advance && (
            <Btn variant="ghost" onClick={advanceStatus}>
              {advance.label}
            </Btn>
          )}
          {item.status === "cancelled" && (
            <Btn variant="ghost" onClick={reactivate}>
              Reactivate
            </Btn>
          )}
          <Btn variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Btn>
          {(item.status === "scheduled" || item.status === "in_progress") && (
            <Btn variant="danger" onClick={cancel}>
              Cancel
            </Btn>
          )}
          <Btn variant="danger" onClick={remove}>
            Delete
          </Btn>
        </div>
      </li>
      {editing && (
        <Modal
          title="Edit scheduled assessment"
          onClose={() => {
            setEditing(false);
            onChanged();
          }}
        >
          <ScheduleForm
            initial={item}
            onClose={() => {
              setEditing(false);
              onChanged();
            }}
          />
        </Modal>
      )}
    </>
  );
}

/* ---------------- Reassessment panel ---------------- */

function ReassessmentPanel() {
  const clients = useMemo(() => {
    const seen = new Map<string, string>();
    for (const name of [
      ...db.schedules.list().map((s) => s.clientName),
      ...db.assessments.list().map((a) => a.clientName),
    ]) {
      const key = name.trim().toLowerCase();
      if (key && !seen.has(key)) seen.set(key, name.trim());
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, []);

  const rows = clients.map((c) => ({ client: c, ...getReassessment(c) }));
  const toneFor = (state: string) =>
    state === "overdue"
      ? ("red" as const)
      : state === "due-soon"
        ? ("yellow" as const)
        : state === "ok"
          ? ("green" as const)
          : ("gray" as const);
  const labelFor = (state: string) =>
    state === "overdue"
      ? "Overdue"
      : state === "due-soon"
        ? "Due soon"
        : state === "ok"
          ? "On track"
          : "No completed assessment";

  if (rows.length === 0) return null;

  return (
    <Card>
      <h2 className="font-semibold">Reassessments due</h2>
      <p className="mt-1 text-sm text-gray-500">
        Completed assessments start a 12-month reassessment clock.
      </p>
      <ul className="mt-3 divide-y divide-gray-100">
        {rows.map((r) => (
          <li
            key={r.client}
            className="flex flex-wrap items-center justify-between gap-2 py-3"
          >
            <div>
              <p className="font-medium text-gray-900">{r.client}</p>
              <p className="mt-0.5 text-sm text-gray-500">
                {r.lastDate
                  ? `Last completed ${fmtDate(r.lastDate)} · Due ${r.dueDate ? fmtDate(r.dueDate) : "—"}`
                  : "No completed assessment on record"}
              </p>
            </div>
            <Badge tone={toneFor(r.state)}>{labelFor(r.state)}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------- Page ---------------- */

export default function SchedulePage() {
  const [mode] = useMode();
  const [, force] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<"list" | "calendar">("list");
  const refresh = () => force((n) => n + 1);

  const items = useMemo(() => db.schedules.list(), []); // re-read each render via refresh
  const upcoming = items
    .filter((s) => s.status === "scheduled" || s.status === "in_progress")
    .sort((a, b) => a.date.localeCompare(b.date) || a.clientName.localeCompare(b.clientName));
  const history = items
    .filter((s) => s.status !== "scheduled" && s.status !== "in_progress")
    .sort((a, b) => b.date.localeCompare(a.date) || a.clientName.localeCompare(b.clientName));

  if (mode === "prod") {
    return (
      <div>
        <ProdNotice />
        <PageHeader title="Schedule" subtitle="Dispatch board for assessment visits." />
        <EmptyState
          title="Nothing scheduled"
          body="The live database is not connected yet, so the schedule is empty."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedule"
        subtitle="Dispatch board for upcoming and past assessment visits."
        actions={
          <Btn onClick={() => setShowForm(true)}>+ Schedule assessment</Btn>
        }
      />

      <ReassessmentPanel />

      {/* List / Calendar toggle */}
      <div className="flex gap-1 rounded-full border border-gray-200 bg-white p-1 self-start">
        {(["list", "calendar"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`min-h-[44px] rounded-full px-4 text-sm font-semibold transition ${
              view === v
                ? "bg-slate-900 text-white"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {v === "list" ? "☰ List" : "📅 Calendar"}
          </button>
        ))}
      </div>

      {view === "calendar" ? (
        <ScheduleCalendar items={items} />
      ) : (
        <>
          <Card className="p-0 md:p-0">
            <h2 className="px-4 pt-4 font-semibold md:px-5 md:pt-5">Upcoming</h2>
            {upcoming.length === 0 ? (
              <div className="px-4 pb-4 pt-2 md:px-5 md:pb-5">
                <EmptyState
                  title="No upcoming visits"
                  body="Schedule an assessment to put it on the dispatch board."
                  action={<Btn onClick={() => setShowForm(true)}>Schedule assessment</Btn>}
                />
              </div>
            ) : (
              <ul className="mt-1">
                {upcoming.map((s) => (
                  <ScheduleRow key={s.id} item={s} onChanged={refresh} />
                ))}
              </ul>
            )}
          </Card>

          {history.length > 0 && (
            <Card className="p-0 md:p-0">
              <h2 className="px-4 pt-4 font-semibold md:px-5 md:pt-5">History</h2>
              <ul className="mt-1">
                {history.map((s) => (
                  <ScheduleRow key={s.id} item={s} onChanged={refresh} />
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {showForm && (
        <Modal title="Schedule assessment" onClose={() => { setShowForm(false); refresh(); }}>
          <ScheduleForm onClose={() => { setShowForm(false); refresh(); }} />
        </Modal>
      )}
    </div>
  );
}
