"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  db,
  uid,
  nowIso,
  type Answer,
  type Assessment,
  type Assessor,
  type EquipmentItem,
  type Finding,
  type ResponseRow,
  type Risk,
} from "@/lib/store";
import {
  getCheckpoint,
  templateSize,
  type AssessmentTemplate,
  type Checkpoint,
} from "@/lib/templates";
import { resolveTemplate } from "@/lib/customTemplates";
import { deriveFindings } from "@/lib/findings";
import AiDraftButton, { AiDraftBadge } from "@/components/AiDraftButton";
import { AssessorCard } from "@/components/AssessorCard";
import { PhotoPicker } from "@/components/PhotoPicker";
import { useMode } from "@/lib/mode";
import ProdNotice from "@/components/ProdNotice";
import {
  Card,
  PageHeader,
  Btn,
  StatusPill,
  RiskBadge,
  Field,
  inputCls,
  EmptyState,
  Modal,
  Badge,
} from "@/components/ui";

/* ------------------------------------------------------------------ */
/* DictateButton — Web Speech API mic for note dictation. Renders       */
/* nothing where speech recognition is unavailable.                    */
/* ------------------------------------------------------------------ */

interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((
        e: {
          resultIndex: number;
          results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
        }
      ) => void)
    | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function DictateButton({ onDictated }: { onDictated: (text: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const cbRef = useRef(onDictated);
  cbRef.current = onDictated;

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => {
      try {
        recRef.current?.stop();
      } catch {
        /* already stopped */
      }
    };
  }, []);

  const stop = () => {
    try {
      recRef.current?.stop();
    } catch {
      /* already stopped */
    }
    recRef.current = null;
    setListening(false);
  };

  const start = () => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    let pending = "";
    const flush = () => {
      if (pending.trim()) {
        cbRef.current(pending.trim());
        pending = "";
      }
    };
    rec.onresult = (e) => {
      let chunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) chunk += r[0].transcript;
      }
      if (chunk.trim()) {
        pending += chunk;
        if (/[.!?…]\s*$/.test(pending.trim()) || pending.length > 60) flush();
      }
    };
    rec.onerror = () => {
      flush();
      recRef.current = null;
      setListening(false);
    };
    rec.onend = () => {
      flush();
      recRef.current = null;
      setListening(false);
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      recRef.current = null;
      setListening(false);
    }
  };

  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={() => (listening ? stop() : start())}
      aria-label={listening ? "Stop dictation" : "Dictate note"}
      title={listening ? "Stop dictation" : "Dictate note"}
      className={`flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-lg border px-3 text-sm font-medium transition active:scale-95 ${
        listening
          ? "border-red-300 bg-red-600 text-white"
          : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      <span aria-hidden>{listening ? "⏹" : "🎙"}</span>
      {listening ? "Listening…" : "Dictate"}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Small input controls                                                */
/* ------------------------------------------------------------------ */

const ANSWER_OPTS: { v: Answer; label: string; active: string }[] = [
  { v: "yes", label: "YES", active: "bg-green-600 text-white border-green-600" },
  { v: "no", label: "NO", active: "bg-red-600 text-white border-red-600" },
  { v: "na", label: "N-A", active: "bg-gray-600 text-white border-gray-600" },
];

function AnswerSeg({
  value,
  onChange,
}: {
  value: Answer | null;
  onChange: (a: Answer) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Answer">
      {ANSWER_OPTS.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={`min-h-[44px] rounded-lg border px-2 py-2.5 text-sm font-bold transition active:scale-[0.98] ${
            value === o.v
              ? o.active
              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const RISK_OPTS: { v: Risk; label: string; active: string }[] = [
  { v: "low", label: "Low", active: "bg-green-600 text-white border-green-600" },
  { v: "moderate", label: "Moderate", active: "bg-yellow-500 text-white border-yellow-500" },
  { v: "high", label: "High", active: "bg-red-600 text-white border-red-600" },
];

function RiskSeg({
  value,
  onChange,
}: {
  value: Risk | null;
  onChange: (r: Risk) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Risk">
      {RISK_OPTS.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={`min-h-[44px] rounded-lg border px-2 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${
            value === o.v
              ? o.active
              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Checkpoint card                                                     */
/* ------------------------------------------------------------------ */

function CheckpointCard({
  checkpoint,
  response,
  onSave,
}: {
  checkpoint: Checkpoint;
  response: ResponseRow | undefined;
  onSave: (patch: Partial<ResponseRow>) => void;
}) {
  const answer = response?.answer ?? null;
  return (
    <Card>
      <div className="flex items-start gap-2">
        <Badge tone="gray">{checkpoint.num}</Badge>
        <p className="flex-1 text-sm font-medium text-gray-900">
          {checkpoint.text}
        </p>
        {answer === "no" && <RiskBadge risk={response?.risk ?? null} />}
      </div>

      <div className="mt-3">
        <AnswerSeg value={answer} onChange={(a) => onSave({ answer: a })} />
      </div>

      {answer !== null && (
        <div className="mt-4 space-y-4">
          <Field label="Risk">
            <RiskSeg
              value={response?.risk ?? null}
              onChange={(r) => onSave({ risk: r })}
            />
          </Field>
        </div>
      )}

      {/* Notes are always visible — one text box per checkpoint, like the hub. */}
      <div className="mt-4 space-y-4">
        <Field label="Assessor note">
          <div className="flex flex-col gap-2">
            <textarea
              className={`${inputCls} min-h-[88px]`}
              value={response?.note ?? ""}
              onChange={(e) => onSave({ note: e.target.value })}
              placeholder="Write what you actually see — not what you assume…"
            />
            <div className="flex justify-end">
              <DictateButton
                onDictated={(text) =>
                  onSave({
                    note: response?.note
                      ? `${response.note} ${text}`
                      : text,
                  })
                }
              />
            </div>
          </div>
        </Field>
        <Field label="Photo ref">
          <input
            className={inputCls}
            value={response?.photoRef ?? ""}
            onChange={(e) => onSave({ photoRef: e.target.value })}
            placeholder="e.g. P014"
          />
        </Field>
        <Field label="Photo evidence">
          <PhotoPicker
            photoIds={response?.photoIds}
            onChange={(photoIds) => onSave({ photoIds })}
          />
        </Field>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Review step — findings + per-finding equipment form                 */
/* ------------------------------------------------------------------ */

function EquipmentForm({
  finding,
  onChanged,
}: {
  finding: Finding;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [priority, setPriority] = useState<Risk>("moderate");
  const items = db.equipment.filter((e) => e.findingId === finding.id);

  const add = () => {
    if (!name.trim()) return;
    db.equipment.upsert({
      id: uid("eqp"),
      assessmentId: finding.assessmentId,
      findingId: finding.id,
      name: name.trim(),
      detail: detail.trim(),
      priority,
    });
    setName("");
    setDetail("");
    setPriority("moderate");
    onChanged();
  };

  return (
    <div className="mt-3 rounded-lg bg-gray-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Equipment
      </p>
      {items.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {items.map((it: EquipmentItem) => (
            <li
              key={it.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{it.name}</p>
                {it.detail && (
                  <p className="truncate text-xs text-gray-500">{it.detail}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <RiskBadge risk={it.priority} />
                <button
                  type="button"
                  aria-label={`Remove ${it.name}`}
                  onClick={() => {
                    db.equipment.remove(it.id);
                    onChanged();
                  }}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Equipment name"
          aria-label="Equipment name"
        />
        <input
          className={inputCls}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Detail (location, qty…)"
          aria-label="Equipment detail"
        />
        <div className="flex gap-2">
          <select
            className={inputCls}
            value={priority}
            onChange={(e) => setPriority(e.target.value as Risk)}
            aria-label="Equipment priority"
          >
            <option value="low">Low</option>
            <option value="moderate">Moderate</option>
            <option value="high">High</option>
          </select>
          <Btn onClick={add} disabled={!name.trim()} className="whitespace-nowrap">
            Add
          </Btn>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* FindingAiDraft — per-finding LLM narrative drafting.               */
/* ------------------------------------------------------------------ */

function FindingAiDraft({
  finding,
  assessment,
  checkpointText,
  onChanged,
}: {
  finding: Finding;
  assessment: Assessment;
  checkpointText?: string;
  onChanged: () => void;
}) {
  const [aiDrafted, setAiDrafted] = useState(false);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <AiDraftButton
        section="finding"
        getData={() => ({
          finding: {
            gap: finding.gapText,
            risk: finding.risk,
            note: finding.note,
            checkpoint: checkpointText ?? "",
          },
          assessment: {
            client: assessment.clientName,
            campus: assessment.campus,
          },
        })}
        existingDraft={finding.recommendation}
        onInsert={(draft) => {
          db.findings.upsert({ ...finding, recommendation: draft });
          setAiDrafted(true);
          onChanged();
        }}
      />
      {aiDrafted && <AiDraftBadge />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ReviewStep                                                          */
/* ------------------------------------------------------------------ */

function ReviewStep({
  assessment,
  template,
  onReopen,
}: {
  assessment: Assessment;
  template: AssessmentTemplate;
  onReopen: () => void;
}) {
  const [tick, setTick] = useState(0);
  const findings = useMemo(
    () =>
      db.findings
        .filter((f) => f.assessmentId === assessment.id)
        .sort((a, b) => {
          const order: Record<string, number> = { high: 0, moderate: 1, low: 2 };
          return order[a.risk] - order[b.risk];
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick, assessment.id]
  );

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-gray-900">
              Assessment complete — findings review
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {findings.length} finding{findings.length === 1 ? "" : "s"}{" "}
              derived from “no” answers. Findings use negative gap statements;
              add equipment per finding below.
            </p>
          </div>
          <Btn variant="ghost" onClick={onReopen}>
            Reopen walkthrough
          </Btn>
        </div>
      </Card>

      {findings.length === 0 ? (
        <EmptyState
          title="No findings"
          body="Every checkpoint was answered yes or n/a — nothing failed."
        />
      ) : (
        findings.map((f) => {
          const hit = getCheckpoint(template, f.checkpointKey);
          return (
            <Card key={f.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {hit && (
                    <p className="text-xs text-gray-400">
                      {hit.domain.name} · {hit.checkpoint.num}
                    </p>
                  )}
                  <p className="mt-1 font-semibold text-gray-900">{f.gapText}</p>
                </div>
                <RiskBadge risk={f.risk} />
              </div>
              {f.note && (
                <p className="mt-2 text-sm text-gray-600">
                  <span className="font-medium text-gray-700">
                    Assessor note:{" "}
                  </span>
                  {f.note}
                </p>
              )}
              <p className="mt-2 text-sm text-gray-600">
                <span className="font-medium text-gray-700">
                  Draft recommendation:{" "}
                </span>
                {f.recommendation}
              </p>
              <FindingAiDraft
                finding={f}
                assessment={assessment}
                checkpointText={hit?.checkpoint.text}
                onChanged={() => setTick((t) => t + 1)}
              />
              <div className="mt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Photo evidence
                </p>
                <PhotoPicker
                  photoIds={f.photoIds}
                  onChange={(photoIds) => {
                    db.findings.upsert({ ...f, photoIds });
                    setTick((t) => t + 1);
                  }}
                />
              </div>
              <EquipmentForm finding={f} onChanged={() => setTick((t) => t + 1)} />
            </Card>
          );
        })
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function TakerPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [mode] = useMode();
  const [tick, setTick] = useState(0);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setTick((t) => t + 1);
  }, []);

  const assessment = db.assessments.get(id);
  const template = useMemo(
    () => resolveTemplate(assessment?.templateId ?? ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assessment?.templateId, tick]
  );

  const responses = useMemo(() => {
    const map: Record<string, ResponseRow> = {};
    for (const r of db.responses.filter((x) => x.assessmentId === id)) {
      map[r.checkpointKey] = r;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tick]);

  if (!assessment) {
    return (
      <div>
        <PageHeader title="Assessment" />
        {mode === "prod" && <ProdNotice />}
        <EmptyState
          title="Assessment not found"
          body="This assessment does not exist on this device."
          action={
            <Btn onClick={() => router.push("/assessments")}>
              Back to assessments
            </Btn>
          }
        />
      </div>
    );
  }

  const total = templateSize(template);
  const answered = Object.values(responses).filter(
    (r) => r.answer !== null
  ).length;
  const unanswered = total - answered;
  const pct = total ? Math.round((answered / total) * 100) : 0;
  const completed = assessment.status === "completed";

  const saveResponse = (key: string, patch: Partial<ResponseRow>) => {
    const existing = db.responses
      .filter((r) => r.assessmentId === id && r.checkpointKey === key)[0];
    const row: ResponseRow = existing ?? {
      id: uid("rsp"),
      assessmentId: id,
      checkpointKey: key,
      answer: null,
      risk: null,
      note: "",
      photoRef: "",
    };
    db.responses.upsert({ ...row, ...patch });
    if (assessment.status === "draft") {
      db.assessments.upsert({ ...assessment, status: "in_progress" });
    }
    setTick((t) => t + 1);
  };

  const complete = () => {
    const findings = deriveFindings(id);
    void findings;
    db.assessments.upsert({
      ...db.assessments.get(id)!,
      status: "completed",
      completedAt: nowIso(),
    });
    for (const s of db.schedules.filter((x) => x.assessmentId === id)) {
      db.schedules.upsert({ ...s, status: "completed" });
    }
    setConfirming(false);
    setTick((t) => t + 1);
  };

  const reopen = () => {
    db.assessments.upsert({ ...assessment, status: "in_progress" });
    setTick((t) => t + 1);
  };

  const teamAssessors = useMemo(() => {
    const ids = [
      ...(assessment.leadAssessorId ? [assessment.leadAssessorId] : []),
      ...assessment.assessorIds,
    ];
    const seen = new Set<string>();
    return ids
      .map((id) => db.assessors.get(id))
      .filter((a): a is Assessor => !!a && !seen.has(a.id) && (seen.add(a.id), true));
  }, [assessment.leadAssessorId, assessment.assessorIds, tick]);

  return (
    <div>
      <PageHeader
        title={assessment.clientName}
        subtitle={`${assessment.campus} · ${template.name}`}
        actions={
          !completed ? (
            <Btn onClick={() => setConfirming(true)}>Complete assessment</Btn>
          ) : (
            <StatusPill status="completed" />
          )
        }
      />
      {mode === "prod" && <ProdNotice />}

      {completed ? (
        <ReviewStep assessment={assessment} template={template} onReopen={reopen} />
      ) : (
        <>
          {/* Cover strip */}
          <Card className="mb-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-gray-400">Date</p>
                <p className="font-medium">{assessment.cover.date || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Lead assessor</p>
                <p className="font-medium">
                  {teamAssessors[0]?.name || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Escort</p>
                <p className="font-medium">{assessment.cover.escort || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Weather</p>
                <p className="font-medium">{assessment.cover.weather || "—"}</p>
              </div>
            </div>
            {assessment.focusNotes && (
              <p className="mt-3 border-t border-gray-100 pt-3 text-sm text-gray-600">
                <span className="font-medium text-gray-700">Focus: </span>
                {assessment.focusNotes}
              </p>
            )}
          </Card>

          {/* Assigned assessors — photo + clearance, verifiable at a glance */}
          {teamAssessors.length > 0 && (
            <div className="mb-4">
              <h2 className="mb-2 text-sm font-semibold text-gray-700">
                Assessors on this visit
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {teamAssessors.map((a) => (
                  <AssessorCard key={a.id} assessor={a} />
                ))}
              </div>
            </div>
          )}

          {/* Progress + domain jump nav */}
          <div className="sticky top-16 z-20 -mx-4 mb-4 bg-gray-50/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                {answered} / {total} checkpoints
              </span>
              <span>{pct}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bar-gradient transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {template.domains.map((d, i) => (
                <a
                  key={d.id}
                  href={`#domain-${d.id}`}
                  className="flex min-h-[44px] shrink-0 items-center rounded-full border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-100"
                >
                  {i + 1}. {d.name}
                </a>
              ))}
            </div>
          </div>

          {/* Domains */}
          <div className="space-y-8">
            {template.domains.map((d, i) => {
              const dAnswered = d.checkpoints.filter(
                (c) => responses[c.key]?.answer != null
              ).length;
              return (
                <section key={d.id} id={`domain-${d.id}`} className="scroll-mt-40">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold">
                      {i + 1}. {d.name}
                    </h2>
                    <Badge tone={dAnswered === d.checkpoints.length ? "green" : "gray"}>
                      {dAnswered}/{d.checkpoints.length}
                    </Badge>
                  </div>
                  <div className="space-y-3">
                    {d.checkpoints.map((c) => (
                      <CheckpointCard
                        key={c.key}
                        checkpoint={c}
                        response={responses[c.key]}
                        onSave={(patch) => saveResponse(c.key, patch)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <div className="mt-8">
            <Btn onClick={() => setConfirming(true)} className="w-full sm:w-auto">
              Complete assessment
            </Btn>
          </div>
        </>
      )}

      {confirming && (
        <Modal title="Complete assessment?" onClose={() => setConfirming(false)}>
          <p className="text-sm text-gray-600">
            {unanswered === 0
              ? "All checkpoints are answered. This will derive findings from every “no” answer and mark any linked schedule item completed."
              : `${unanswered} checkpoint${unanswered === 1 ? " is" : "s are"} still unanswered. Unanswered checkpoints will not produce findings. This will derive findings from every “no” answer and mark any linked schedule item completed.`}
          </p>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Btn variant="ghost" onClick={() => setConfirming(false)}>
              Keep working
            </Btn>
            <Btn onClick={complete}>Complete assessment</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
