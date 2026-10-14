"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { buildVisitIcs, googleCalendarUrl, icsFilename } from "@/lib/calendar";
import { download } from "@/lib/reports";
import { latestCompletedFor, copyResponsesForward } from "@/lib/reassess";
import { deriveFindings } from "@/lib/findings";
import { allTemplates, resolveTemplate } from "@/lib/customTemplates";

/** Built-ins + the device's custom templates — a visit scheduled
 *  against a custom template must be selectable here too. */
function templateOptions(): { id: string; label: string }[] {
  return allTemplates().map(({ template }) => ({
    id: template.id,
    label: template.name,
  }));
}

function templateLabel(id: string): string {
  return resolveTemplate(id).name ?? id;
}

/** Prominent section heading — gradient accent bar + count chip, so the
 *  page's sections read at a glance instead of blending into row text. */
function SectionHeading({
  children,
  count,
  className = "",
}: {
  children: string;
  count?: number;
  className?: string;
}) {
  return (
    <h2
      className={`flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-900 ${className}`}
    >
      <span
        aria-hidden
        className="h-6 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-violet-500 to-indigo-500"
      />
      {children}
      {count != null && (
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">
          {count}
        </span>
      )}
    </h2>
  );
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
  prefill,
  onClose,
}: {
  initial?: ScheduleItem;
  /** Pre-fill for a NEW entry (e.g. scheduling a reassessment from the panel). */
  prefill?: { clientName: string; campus?: string; templateId?: string };
  onClose: () => void;
}) {
  const [clientName, setClientName] = useState(
    initial?.clientName ?? prefill?.clientName ?? ""
  );
  const [campus, setCampus] = useState(initial?.campus ?? prefill?.campus ?? "");
  const [date, setDate] = useState(initial?.date ?? todayLocal());
  const [templateId, setTemplateId] = useState(
    initial?.templateId ?? prefill?.templateId ?? "isc42"
  );
  const [assessorId, setAssessorId] = useState(initial?.assessorId ?? "");
  const [focusNotes, setFocusNotes] = useState(
    initial?.focusNotes ?? (prefill ? "Annual reassessment" : "")
  );
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
      {prefill && !initial && (
        <p className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-800">
          Scheduling the reassessment for{" "}
          <strong>{prefill.clientName}</strong> — pick the date and assign an
          assessor.
        </p>
      )}
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
            {templateOptions().map((t) => (
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

  const calendarDetails = {
    templateLabel: templateLabel(item.templateId),
    assessorName: assessor?.name,
  };

  const downloadIcs = () => {
    download(
      icsFilename(item),
      buildVisitIcs(item, calendarDetails),
      "text/calendar;charset=utf-8"
    );
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
    // Reassessment visits start pre-loaded with the client's most recent
    // completed answers (same rule as the Reassess action): the visit
    // confirms what changed instead of starting from a blank walkthrough.
    const prior = latestCompletedFor(item.clientName);
    if (prior) {
      const copied = copyResponsesForward(prior, assessment);
      if (copied > 0) deriveFindings(assessment.id);
    }
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
            <Link
              href={`/clients?client=${encodeURIComponent(item.clientName)}`}
              className="font-semibold text-gray-900 hover:text-violet-700 hover:underline"
            >
              {item.clientName}
            </Link>
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
          {(item.status === "scheduled" || item.status === "in_progress") && (
            <>
              <Btn variant="ghost" onClick={downloadIcs}>
                📅 Download .ics
              </Btn>
              <a
                href={googleCalendarUrl(item, calendarDetails)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-violet-300 hover:bg-violet-50/50 hover:text-violet-700"
              >
                Add to Google Calendar
              </a>
            </>
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

function ReassessmentPanel({
  onSchedule,
}: {
  onSchedule: (client: string) => void;
}) {
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
      <SectionHeading count={rows.length}>Reassessments due</SectionHeading>
      <p className="mt-1 text-sm text-gray-500">
        Completed assessments start a 12-month reassessment clock. Tap a
        school to schedule its reassessment and assign an assessor.
      </p>
      <ul className="mt-3 divide-y divide-gray-100">
        {rows.map((r) => (
          <li key={r.client}>
            <div className="flex flex-wrap items-center gap-2 py-2">
              <button
                type="button"
                onClick={() => onSchedule(r.client)}
                className="flex min-h-[44px] flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-violet-50/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-gray-900">
                    {r.client}
                  </span>
                  <span className="mt-0.5 block text-sm text-gray-500">
                    {r.lastDate
                      ? `Last completed ${fmtDate(r.lastDate)} · Due ${r.dueDate ? fmtDate(r.dueDate) : "—"}`
                      : "No completed assessment on record"}
                  </span>
                </span>
                <Badge tone={toneFor(r.state)}>{labelFor(r.state)}</Badge>
                <span className="text-sm font-semibold text-violet-700">
                  + Schedule
                </span>
              </button>
              <Link
                href={`/clients?client=${encodeURIComponent(r.client)}`}
                className="flex min-h-[44px] items-center rounded-lg px-2 text-sm font-medium text-slate-500 hover:text-violet-700"
              >
                History →
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------- Page ---------------- */

export default function SchedulePage() {
  return (
    <Suspense>
      <ScheduleInner />
    </Suspense>
  );
}

function ScheduleInner() {
  const [mode] = useMode();
  const [, force] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [prefill, setPrefill] = useState<{
    clientName: string;
    campus?: string;
    templateId?: string;
  } | null>(null);
  const [view, setView] = useState<"list" | "calendar">("list");
  const searchParams = useSearchParams();
  const assessorFilter = searchParams.get("assessor");
  const refresh = () => force((n) => n + 1);

  const items = useMemo(() => db.schedules.list(), []); // re-read each render via refresh
  const matchesAssessor = (s: ScheduleItem) =>
    !assessorFilter || s.assessorId === assessorFilter;
  const upcoming = items
    .filter((s) => s.status === "scheduled" || s.status === "in_progress")
    .filter(matchesAssessor)
    .sort((a, b) => a.date.localeCompare(b.date) || a.clientName.localeCompare(b.clientName));
  const history = items
    .filter((s) => s.status !== "scheduled" && s.status !== "in_progress")
    .filter(matchesAssessor)
    .sort((a, b) => b.date.localeCompare(a.date) || a.clientName.localeCompare(b.clientName));
  const filterAssessorName = assessorFilter
    ? db.assessors.get(assessorFilter)?.name
    : null;

  /** Open the schedule form pre-filled from a reassessment row: the
   *  school's campus/template carry over from its latest assessment. */
  const openScheduleFor = (client: string) => {
    const mine = db.assessments
      .filter((a) => a.clientName === client)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const last = mine.find((a) => a.status === "completed") ?? mine[0];
    setPrefill({
      clientName: client,
      campus: last?.campus,
      templateId: last?.templateId,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setPrefill(null);
    refresh();
  };

  return (
    <div className="space-y-6">
      {mode === "prod" && <ProdNotice />}
      <PageHeader
        title="Schedule"
        subtitle="Dispatch board for upcoming and past assessment visits."
        actions={
          <Btn
            onClick={() => {
              setPrefill(null);
              setShowForm(true);
            }}
          >
            + Schedule assessment
          </Btn>
        }
      />

      <ReassessmentPanel onSchedule={openScheduleFor} />

      {/* Active assessor filter */}
      {assessorFilter && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-2 text-sm font-semibold text-violet-800">
            👤 {filterAssessorName ?? "Assessor"}
            <Link
              href="/schedule"
              aria-label="Clear assessor filter"
              className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-full hover:bg-violet-200"
            >
              ✕
            </Link>
          </span>
        </div>
      )}

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
        <ScheduleCalendar items={items.filter(matchesAssessor)} />
      ) : (
        <>
          <Card className="p-0 md:p-0">
            <SectionHeading count={upcoming.length} className="px-4 pt-4 md:px-5 md:pt-5">
              Upcoming
            </SectionHeading>
            {upcoming.length === 0 ? (
              <div className="px-4 pb-4 pt-2 md:px-5 md:pb-5">
                <EmptyState
                  title="No upcoming visits"
                  body="Schedule an assessment to put it on the dispatch board."
                  action={
                    <Btn
                      onClick={() => {
                        setPrefill(null);
                        setShowForm(true);
                      }}
                    >
                      Schedule assessment
                    </Btn>
                  }
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
              <SectionHeading count={history.length} className="px-4 pt-4 md:px-5 md:pt-5">
                History
              </SectionHeading>
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
        <Modal
          title={
            prefill
              ? `Schedule reassessment — ${prefill.clientName}`
              : "Schedule assessment"
          }
          onClose={closeForm}
        >
          <ScheduleForm prefill={prefill ?? undefined} onClose={closeForm} />
        </Modal>
      )}
    </div>
  );
}
