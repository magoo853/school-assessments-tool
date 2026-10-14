/**
 * Templates — built-in system templates (read-only) plus assessor-built
 * custom templates (create / edit / delete). Custom templates work
 * everywhere built-ins do: new assessments, walkthroughs, reports, hub export.
 */
"use client";

import { useEffect, useState } from "react";
import { db, uid, type CustomTemplate } from "@/lib/store";
import {
  TEMPLATES,
  templateSize,
  type AssessmentTemplate,
} from "@/lib/templates";
import {
  allTemplates,
  newCustomTemplate,
  saveCustomTemplate,
  deleteCustomTemplate,
  templateInUse,
  validateCustomTemplate,
} from "@/lib/customTemplates";
import { useMode } from "@/lib/mode";
import {
  Card,
  PageHeader,
  Btn,
  Badge,
  EmptyState,
  Field,
  inputCls,
  Modal,
} from "@/components/ui";
import ProdNotice from "@/components/ProdNotice";

type DraftDomain = CustomTemplate["domains"][number];
type DraftCheckpoint = DraftDomain["checkpoints"][number];

function renumber(t: CustomTemplate): CustomTemplate {
  return {
    ...t,
    domains: t.domains.map((d, di) => ({
      ...d,
      checkpoints: d.checkpoints.map((c, ci) => ({
        ...c,
        key: `${di + 1}.${ci + 1}`,
        num: `${di + 1}.${ci + 1}`,
      })),
    })),
  };
}

function blankCheckpoint(di: number, ci: number): DraftCheckpoint {
  return {
    key: `${di + 1}.${ci + 1}`,
    num: `${di + 1}.${ci + 1}`,
    text: "",
    gap: "",
    rec: "",
  };
}

function TemplateBuilder({
  initial,
  onClose,
}: {
  initial: CustomTemplate;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<CustomTemplate>(initial);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<CustomTemplate>) =>
    setDraft((d) => ({ ...d, ...patch }));

  const addDomain = () =>
    set({
      domains: [
        ...draft.domains,
        { id: uid("dom"), name: "", checkpoints: [] },
      ],
    });

  const updateDomain = (di: number, name: string) =>
    set({
      domains: draft.domains.map((d, i) => (i === di ? { ...d, name } : d)),
    });

  const removeDomain = (di: number) =>
    set({ domains: draft.domains.filter((_, i) => i !== di) });

  const addCheckpoint = (di: number) =>
    set({
      domains: draft.domains.map((d, i) =>
        i === di
          ? {
              ...d,
              checkpoints: [
                ...d.checkpoints,
                blankCheckpoint(di, d.checkpoints.length),
              ],
            }
          : d
      ),
    });

  const updateCheckpoint = (
    di: number,
    ci: number,
    patch: Partial<DraftCheckpoint>
  ) =>
    set({
      domains: draft.domains.map((d, i) =>
        i === di
          ? {
              ...d,
              checkpoints: d.checkpoints.map((c, j) =>
                j === ci ? { ...c, ...patch } : c
              ),
            }
          : d
      ),
    });

  const removeCheckpoint = (di: number, ci: number) =>
    set({
      domains: draft.domains.map((d, i) =>
        i === di
          ? { ...d, checkpoints: d.checkpoints.filter((_, j) => j !== ci) }
          : d
      ),
    });

  const save = () => {
    const numbered = renumber(draft);
    const err = validateCustomTemplate(numbered);
    if (err) {
      setError(err);
      return;
    }
    saveCustomTemplate(numbered);
    onClose();
  };

  const checkpointCount = draft.domains.reduce(
    (n, d) => n + d.checkpoints.length,
    0
  );

  return (
    <div className="space-y-5">
      {templateInUse(draft.id) && (
        <p
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800"
          role="alert"
        >
          ⚠ This template is in use by an assessment or schedule. Editing
          checkpoint wording is safe, but removing a checkpoint — or a whole
          domain — disconnects the answers already recorded against it on
          those assessments. Their stored answers stay on the device but
          stop counting toward progress and findings.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Template name">
          <input
            className={inputCls}
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. District perimeter audit"
            autoFocus
          />
        </Field>
        <Field label="Description">
          <input
            className={inputCls}
            value={draft.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="What this template covers"
          />
        </Field>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">
          Domains & checkpoints{" "}
          <span className="font-normal text-slate-400">
            ({draft.domains.length} domains · {checkpointCount} checkpoints)
          </span>
        </p>
        <Btn variant="ghost" onClick={addDomain}>
          + Domain
        </Btn>
      </div>

      {draft.domains.length === 0 && (
        <EmptyState
          title="No domains yet"
          body="Add a domain (e.g. Perimeter), then add checkpoints under it. Checkpoint numbers are assigned automatically."
        />
      )}

      {draft.domains.map((d, di) => (
        <Card key={d.id} className="!border-violet-200">
          <div className="flex items-center gap-2">
            <input
              className={`${inputCls} font-semibold`}
              value={d.name}
              onChange={(e) => updateDomain(di, e.target.value)}
              placeholder={`Domain ${di + 1} name`}
              aria-label={`Domain ${di + 1} name`}
            />
            <button
              type="button"
              onClick={() => removeDomain(di)}
              aria-label={`Delete domain ${di + 1}`}
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 space-y-3">
            {d.checkpoints.map((c, ci) => (
              <div
                key={`${d.id}-${ci}`}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-violet-700">
                    {di + 1}.{ci + 1}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeCheckpoint(di, ci)}
                    aria-label={`Delete checkpoint ${di + 1}.${ci + 1}`}
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-2 space-y-2">
                  <Field label="Checkpoint (answer YES / NO / N-A)">
                    <textarea
                      className={`${inputCls} min-h-[64px]`}
                      value={c.text}
                      onChange={(e) =>
                        updateCheckpoint(di, ci, { text: e.target.value })
                      }
                      placeholder="Positive criterion, e.g. All exterior doors lock from the inside"
                    />
                  </Field>
                  <Field label="Gap statement (when answered NO)">
                    <textarea
                      className={`${inputCls} min-h-[64px]`}
                      value={c.gap}
                      onChange={(e) =>
                        updateCheckpoint(di, ci, { gap: e.target.value })
                      }
                      placeholder="Negative finding wording, e.g. Classroom doors cannot be locked from the inside."
                    />
                  </Field>
                  <Field label="Draft recommendation">
                    <textarea
                      className={`${inputCls} min-h-[64px]`}
                      value={c.rec}
                      onChange={(e) =>
                        updateCheckpoint(di, ci, { rec: e.target.value })
                      }
                      placeholder="What the school should do about it"
                    />
                  </Field>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => addCheckpoint(di)}
              className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-dashed border-violet-300 text-sm font-semibold text-violet-700 hover:bg-violet-50"
            >
              + Checkpoint
            </button>
          </div>
        </Card>
      ))}

      {error && (
        <p className="text-sm font-medium text-rose-700" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Btn onClick={save} className="flex-1 sm:flex-none">
          💾 Save template
        </Btn>
        <Btn variant="ghost" onClick={onClose} className="flex-1 sm:flex-none">
          Cancel
        </Btn>
      </div>
    </div>
  );
}

function BuiltinCard({ t }: { t: AssessmentTemplate }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{t.name}</p>
          <p className="mt-1 text-sm text-slate-500">{t.description}</p>
        </div>
        <Badge tone="violet">System</Badge>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        {t.domains.length} domains · {templateSize(t)} checkpoints · read-only
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {t.domains.map((d) => d.name).join(" · ")}
      </p>
    </Card>
  );
}

export default function TemplatesPage() {
  const [mode] = useMode();
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<CustomTemplate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CustomTemplate | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setTick((t) => t + 1);
  }, [mode]);

  const customList = allTemplates().filter((x) => x.custom);
  void tick;

  const doDelete = (t: CustomTemplate) => {
    if (templateInUse(t.id)) {
      setDeleteError(
        `"${t.name}" is used by an assessment or schedule and can't be deleted — those records depend on it.`
      );
      setConfirmDelete(null);
      return;
    }
    deleteCustomTemplate(t.id);
    setConfirmDelete(null);
    setTick((x) => x + 1);
  };

  return (
    <div>
      <PageHeader
        title="Templates"
        subtitle="System walkthroughs plus your own custom checklists — custom templates work everywhere built-ins do."
        actions={
          <Btn
            onClick={() => {
              setDeleteError(null);
              setEditing(newCustomTemplate());
            }}
          >
            + New template
          </Btn>
        }
      />
      {mode === "prod" && <ProdNotice />}

      {editing ? (
        <TemplateBuilder
          initial={editing}
          onClose={() => {
            setEditing(null);
            setTick((t) => t + 1);
          }}
        />
      ) : (
        <div className="space-y-6">
          {deleteError && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800" role="alert">
              {deleteError}
            </p>
          )}

          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-slate-400">
              System templates
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {TEMPLATES.map((t) => (
                <BuiltinCard key={t.id} t={t} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-slate-400">
              Custom templates
            </h2>
            {customList.length === 0 ? (
              <EmptyState
                title="No custom templates yet"
                body="Build your own checklist — domains, checkpoints, gap statements, and draft recommendations. It will appear in the New assessment picker immediately."
                action={
                  <Btn onClick={() => setEditing(newCustomTemplate())}>
                    + New template
                  </Btn>
                }
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {customList.map(({ template: t }) => (
                    <Card key={t.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{t.name}</p>
                          {t.description && (
                            <p className="mt-1 text-sm text-slate-500">
                              {t.description}
                            </p>
                          )}
                        </div>
                        <Badge tone="cyan">Custom</Badge>
                      </div>
                      <p className="mt-3 text-xs text-slate-400">
                        {t.domains.length} domains · {templateSize(t)} checkpoints
                        {templateInUse(t.id) ? " · in use" : ""}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Btn
                          variant="ghost"
                          onClick={() => {
                            const c = db.customTemplates.get(t.id);
                            if (c) setEditing(c);
                          }}
                          className="!min-h-[44px] flex-1"
                        >
                          ✏️ Edit
                        </Btn>
                        <Btn
                          variant="danger"
                          onClick={() => {
                            const c = db.customTemplates.get(t.id);
                            if (c) setConfirmDelete(c);
                          }}
                          className="!min-h-[44px] flex-1"
                        >
                          🗑 Delete
                        </Btn>
                      </div>
                    </Card>
                  ))}
              </div>
            )}
          </section>
        </div>
      )}

      {confirmDelete && (
        <Modal title="Delete template" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-slate-600">
            Delete <strong>{confirmDelete.name}</strong>? This can't be undone.
          </p>
          <div className="mt-4 flex gap-2">
            <Btn
              variant="danger"
              onClick={() => doDelete(confirmDelete)}
              className="flex-1"
            >
              Delete
            </Btn>
            <Btn
              variant="ghost"
              onClick={() => setConfirmDelete(null)}
              className="flex-1"
            >
              Cancel
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
