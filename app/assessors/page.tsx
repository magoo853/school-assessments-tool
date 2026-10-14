/**
 * Assessors directory (slice 3).
 *
 * - Directory cards: photo (or initials avatar), name, title, clearance
 *   badge, phone/email, edit + delete.
 * - Add/Edit modal: contact info, photo upload (data URL), clearance status
 *   + issue/expiry dates, clearance letter upload (data URL), notes.
 * - Per-assessor expandable "Pre-visit checklist": photo match, clearance
 *   current, letter on file, ID verified — stored on the row as
 *   `previsit?: Record<string, boolean>` (typed locally via intersection;
 *   lib/store.ts is untouched).
 * - Search filter by name. Prod mode renders <ProdNotice/> + empty state.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { db, uid } from "@/lib/store";
import type { Assessor, ClearanceStatus } from "@/lib/store";
import { compressImageFile } from "@/lib/photos";
import { useMode } from "@/lib/mode";
import { assessorWorkload, type AssessorWorkload } from "@/lib/data";
import {
  Card,
  PageHeader,
  Btn,
  Badge,
  Field,
  inputCls,
  EmptyState,
  Modal,
} from "@/components/ui";
import ProdNotice from "@/components/ProdNotice";

/** Local extension: pre-visit checklist state rides on the row object. */
type AssessorRow = Assessor & { previsit?: Record<string, boolean> };

const PREVISIT_ITEMS: { key: string; label: string; hint: string }[] = [
  {
    key: "photo",
    label: "Photo match verified",
    hint: "Assessor's face matches the photo in this directory",
  },
  {
    key: "clearance",
    label: "Clearance current",
    hint: "Background clearance is active and not expired",
  },
  {
    key: "letter",
    label: "Clearance letter on file",
    hint: "Clearance letter uploaded to this record",
  },
  {
    key: "id",
    label: "ID verified",
    hint: "Government-issued ID checked at site check-in",
  },
];

const STATUS_OPTIONS: { value: ClearanceStatus; label: string }[] = [
  { value: "current", label: "Current" },
  { value: "pending", label: "Pending" },
  { value: "expired", label: "Expired" },
];

interface FormState {
  name: string;
  title: string;
  phone: string;
  email: string;
  photo?: string;
  clearanceStatus: ClearanceStatus;
  clearanceDate: string;
  clearanceExpiry: string;
  clearanceLetter?: string;
  notes: string;
}

function blankForm(): FormState {
  return {
    name: "",
    title: "",
    phone: "",
    email: "",
    photo: undefined,
    clearanceStatus: "current",
    clearanceDate: "",
    clearanceExpiry: "",
    clearanceLetter: undefined,
    notes: "",
  };
}

function formFromRow(a: AssessorRow): FormState {
  return {
    name: a.name,
    title: a.title,
    phone: a.phone,
    email: a.email,
    photo: a.photo,
    clearanceStatus: a.clearanceStatus,
    clearanceDate: a.clearanceDate ?? "",
    clearanceExpiry: a.clearanceExpiry ?? "",
    clearanceLetter: a.clearanceLetter,
    notes: a.notes,
  };
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Non-image uploads (clearance-letter PDFs) are stored verbatim as
 *  data URLs inside the assessors table — cap them so one scan can't
 *  blow the shared ~5MB device quota and brick every other save. */
const MAX_LETTER_BYTES = 1_500_000;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function clearanceInfo(a: Assessor): {
  tone: "green" | "yellow" | "red";
  label: string;
} {
  const today = new Date().toISOString().slice(0, 10);
  if (a.clearanceExpiry && a.clearanceExpiry < today)
    return { tone: "red", label: "Clearance expired" };
  if (a.clearanceStatus === "expired")
    return { tone: "red", label: "Clearance expired" };
  if (a.clearanceStatus === "pending")
    return { tone: "yellow", label: "Clearance pending" };
  return { tone: "green", label: "Clearance current" };
}

function AssessorCard({
  assessor,
  workload,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onCheck,
}: {
  assessor: AssessorRow;
  workload: AssessorWorkload;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCheck: (key: string, value: boolean) => void;
}) {
  const a = assessor;
  const badge = clearanceInfo(a);
  const checked = PREVISIT_ITEMS.filter((i) => a.previsit?.[i.key]).length;
  const cleared = PREVISIT_ITEMS.length > 0 && checked === PREVISIT_ITEMS.length;

  return (
    <Card
      className={`flex flex-col ${cleared ? "border-emerald-300 ring-2 ring-emerald-500/50" : ""}`}
    >
      <div className="flex gap-3">
        <div className="relative shrink-0 self-start">
          {a.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={a.photo}
              alt={a.name}
              className="h-16 w-16 rounded-xl border border-gray-200 object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="flex h-16 w-16 items-center justify-center rounded-xl bg-violet-100 text-xl font-bold text-violet-800"
            >
              {initials(a.name)}
            </div>
          )}
          {cleared && (
            <span
              className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-base font-bold text-white ring-2 ring-white"
              role="img"
              aria-label="Cleared for visit"
              title="Pre-visit checklist complete — cleared for the visit"
            >
              ✓
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <Link
            href={`/schedule?assessor=${a.id}`}
            className="truncate text-base font-bold text-gray-900 hover:text-violet-700 hover:underline"
          >
            {a.name}
          </Link>
          {a.title && <p className="truncate text-sm text-gray-500">{a.title}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={badge.tone}>{badge.label}</Badge>
            {cleared && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 py-1 pl-1.5 pr-2.5 text-xs font-bold text-white">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-[11px] font-bold text-emerald-700">
                  ✓
                </span>
                CLEARED FOR VISIT
              </span>
            )}
            {a.clearanceExpiry && (
              <span className="text-xs text-gray-500">
                exp. {formatDate(a.clearanceExpiry)}
              </span>
            )}
          </div>
          {/* Workload — drills to the assessor's schedule */}
          <Link
            href={`/schedule?assessor=${a.id}`}
            className="mt-2 flex flex-wrap gap-1.5 rounded-lg transition-colors hover:bg-violet-50/50"
            aria-label={`${a.name}'s schedule`}
          >
            <Badge tone="cyan">🗓 {workload.scheduled} scheduled</Badge>
            <Badge tone="violet">🔄 {workload.inProgress} in progress</Badge>
            <Badge tone="green">✅ {workload.completed} completed</Badge>
          </Link>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-sm">
        {a.phone && (
          <a
            href={`tel:${a.phone}`}
            className="block min-h-[44px] truncate py-2 text-blue-700"
          >
            {a.phone}
          </a>
        )}
        {a.email && (
          <a
            href={`mailto:${a.email}`}
            className="block min-h-[44px] truncate py-2 text-blue-700"
          >
            {a.email}
          </a>
        )}
      </div>

      {expanded && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm font-semibold text-gray-800">
            Pre-visit checklist{" "}
            <span className="font-normal text-gray-500">
              ({checked}/{PREVISIT_ITEMS.length})
            </span>
          </p>
          {cleared && (
            <p className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-emerald-700">
                ✓
              </span>
              Checklist complete — cleared for the visit
            </p>
          )}
          <div className="mt-2 space-y-1">
            {PREVISIT_ITEMS.map((item) => (
              <label
                key={item.key}
                className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg px-1 py-2 hover:bg-gray-100"
              >
                <input
                  type="checkbox"
                  checked={!!a.previsit?.[item.key]}
                  onChange={(e) => onCheck(item.key, e.target.checked)}
                  className="mt-1 h-6 w-6 shrink-0 rounded accent-blue-700"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-800">
                    {item.label}
                  </span>
                  <span className="block text-xs text-gray-500">{item.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
        <Btn variant="ghost" onClick={onToggle} className="flex-1">
          {expanded
            ? "Hide checklist"
            : cleared
              ? `✓ Cleared — checklist (${checked}/${PREVISIT_ITEMS.length})`
              : `Pre-visit checklist (${checked}/${PREVISIT_ITEMS.length})`}
        </Btn>
        <Btn variant="ghost" onClick={onEdit}>
          Edit
        </Btn>
        <Btn variant="danger" onClick={onDelete} aria-label={`Delete ${a.name}`}>
          Delete
        </Btn>
      </div>
    </Card>
  );
}

export default function AssessorsPage() {
  const [mode] = useMode();
  const [rows, setRows] = useState<AssessorRow[]>([]);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AssessorRow | null>(null);
  const [form, setForm] = useState<FormState>(blankForm());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [fileError, setFileError] = useState("");

  const refresh = () => setRows(db.assessors.list() as AssessorRow[]);

  useEffect(() => {
    refresh();
  }, [mode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (a) =>
        a.name.toLowerCase().includes(q) || a.title.toLowerCase().includes(q)
    );
  }, [rows, query]);

  const workloads = useMemo(() => {
    const m = new Map<string, AssessorWorkload>();
    for (const a of rows) m.set(a.id, assessorWorkload(a.id));
    return m;
  }, [rows, mode]);

  const teamTotals = useMemo(() => {
    const t = { scheduled: 0, inProgress: 0, completed: 0 };
    for (const w of workloads.values()) {
      t.scheduled += w.scheduled;
      t.inProgress += w.inProgress;
      t.completed += w.completed;
    }
    return t;
  }, [workloads]);

  const openAdd = () => {
    setEditing(null);
    setForm(blankForm());
    setShowForm(true);
  };

  const openEdit = (a: AssessorRow) => {
    setEditing(a);
    setForm(formFromRow(a));
    setShowForm(true);
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onPhotoFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError("");
    try {
      // Compress like walkthrough photos — a raw phone photo (3–8MB)
      // would otherwise sit uncompressed in the assessors table.
      set("photo", await compressImageFile(file));
    } catch {
      setFileError("That photo couldn't be read as an image.");
    }
  };

  const onLetterFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError("");
    try {
      if (file.type.startsWith("image/")) {
        set("clearanceLetter", await compressImageFile(file));
      } else if (file.size > MAX_LETTER_BYTES) {
        setFileError(
          `That file is ${(file.size / 1_000_000).toFixed(1)}MB — clearance letters are stored on-device, so keep PDFs under 1.5MB (a compressed scan works).`
        );
      } else {
        set("clearanceLetter", await readAsDataURL(file));
      }
    } catch {
      setFileError("That file couldn't be read.");
    }
  };

  const save = () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const row: AssessorRow = {
      id: editing?.id ?? uid("asr"),
      name: form.name.trim(),
      title: form.title.trim(),
      photo: form.photo,
      phone: form.phone.trim(),
      email: form.email.trim(),
      clearanceStatus: form.clearanceStatus,
      clearanceDate: form.clearanceDate || undefined,
      clearanceExpiry: form.clearanceExpiry || undefined,
      clearanceLetter: form.clearanceLetter,
      notes: form.notes.trim(),
      previsit: editing?.previsit,
    };
    db.assessors.upsert(row);
    setSaving(false);
    setShowForm(false);
    setEditing(null);
    refresh();
  };

  const remove = (a: AssessorRow) => {
    if (!window.confirm(`Remove ${a.name} from the assessor directory?`)) return;
    db.assessors.remove(a.id);
    refresh();
  };

  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onCheck = (a: AssessorRow, key: string, value: boolean) => {
    const updated: AssessorRow = {
      ...a,
      previsit: { ...(a.previsit ?? {}), [key]: value },
    };
    db.assessors.upsert(updated);
    refresh();
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {mode === "prod" && <ProdNotice />}
      <PageHeader
        title="Assessors"
        subtitle="Who's coming to campus. Verify each assessor's photo and background clearance before the visit."
        actions={<Btn onClick={openAdd}>＋ Add assessor</Btn>}
      />

      {/* Team workload summary */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <p className="text-sm font-semibold text-slate-900">Team workload</p>
          <p className="text-sm text-slate-600">
            🗓 <span className="font-bold text-slate-900">{teamTotals.scheduled}</span> upcoming visits
          </p>
          <p className="text-sm text-slate-600">
            🔄 <span className="font-bold text-slate-900">{teamTotals.inProgress}</span> in progress
          </p>
          <p className="text-sm text-slate-600">
            ✅ <span className="font-bold text-slate-900">{teamTotals.completed}</span> completed
          </p>
        </div>
      </Card>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search assessors by name…"
        aria-label="Search assessors"
        className={`${inputCls} mb-4`}
      />

      {filtered.length === 0 ? (
        <EmptyState
          title={query ? "No assessors match your search" : "No assessors yet"}
          body={
            query
              ? "Try a different name."
              : "Add the first assessor — photo, contact info, and background clearance are checked here before every site visit."
          }
          action={!query ? <Btn onClick={openAdd}>＋ Add assessor</Btn> : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => (
            <AssessorCard
              key={a.id}
              assessor={a}
              workload={workloads.get(a.id) ?? { scheduled: 0, inProgress: 0, completed: 0 }}
              expanded={expandedIds.has(a.id)}
              onToggle={() => toggleExpanded(a.id)}
              onEdit={() => openEdit(a)}
              onDelete={() => remove(a)}
              onCheck={(key, value) => onCheck(a, key, value)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <Modal
          title={editing ? `Edit ${editing.name}` : "Add assessor"}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              {form.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.photo}
                  alt="Assessor photo preview"
                  className="h-20 w-20 rounded-xl border border-gray-200 object-cover"
                />
              ) : (
                <div
                  aria-hidden
                  className="flex h-20 w-20 items-center justify-center rounded-xl bg-violet-100 text-2xl font-bold text-violet-800"
                >
                  {initials(form.name)}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Upload photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onPhotoFile(e.target.files?.[0])}
                  />
                </label>
                {form.photo && (
                  <Btn variant="ghost" onClick={() => set("photo", undefined)}>
                    Remove
                  </Btn>
                )}
              </div>
            </div>

            <Field label="Full name">
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Jordan Smith"
                className={inputCls}
              />
            </Field>

            <Field label="Title / role">
              <input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Lead assessor"
                className={inputCls}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone">
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  placeholder="(813) 555-0142"
                  className={inputCls}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="jordan@example.com"
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Clearance status">
              <select
                value={form.clearanceStatus}
                onChange={(e) =>
                  set("clearanceStatus", e.target.value as ClearanceStatus)
                }
                className={inputCls}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Clearance issue date">
                <input
                  type="date"
                  value={form.clearanceDate}
                  onChange={(e) => set("clearanceDate", e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Clearance expiry date">
                <input
                  type="date"
                  value={form.clearanceExpiry}
                  onChange={(e) => set("clearanceExpiry", e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>

            <Field
              label="Clearance letter"
              hint="PDF or image — stored with this record"
            >
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Upload letter
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    className="hidden"
                    onChange={(e) => onLetterFile(e.target.files?.[0])}
                  />
                </label>
                {form.clearanceLetter ? (
                  <>
                    <Badge tone="green">Letter on file</Badge>
                    <Btn variant="ghost" onClick={() => set("clearanceLetter", undefined)}>
                      Remove
                    </Btn>
                  </>
                ) : (
                  <Badge tone="gray">No letter</Badge>
                )}
              </div>
            </Field>

            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Screening notes, restrictions, preferences…"
                rows={3}
                className={inputCls}
              />
            </Field>

            {fileError && (
              <p className="text-sm font-medium text-red-600">{fileError}</p>
            )}
            <div className="flex gap-2 pt-2">
              <Btn
                onClick={save}
                disabled={!form.name.trim() || saving}
                className="flex-1"
              >
                {editing ? "Save changes" : "Add assessor"}
              </Btn>
              <Btn
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
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
