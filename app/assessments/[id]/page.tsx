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
import { resolveTemplate, isTemplateMissing } from "@/lib/customTemplates";
import { deriveFindings } from "@/lib/findings";
import AiDraftButton, { AiDraftBadge } from "@/components/AiDraftButton";
import { AssessorCard } from "@/components/AssessorCard";
import { PhotoPicker } from "@/components/PhotoPicker";
import { useMode } from "@/lib/mode";
import ProdNotice from "@/components/ProdNotice";
import FslWizard from "@/components/FslWizard";
import TemplatePickerModal from "@/components/TemplatePickerModal";
import ReassessModal from "@/components/ReassessModal";
import {
  countAssessmentData,
  deleteAssessmentCascade,
} from "@/lib/deleteAssessment";
import {
  isReviewLocked,
  submitForReview,
  approveReview,
  sendBack,
  withdrawReview,
} from "@/lib/review";
import { getProfile } from "@/lib/profile";
import { domainViews } from "@/lib/walkthroughFilter";
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
  ConfirmModal,
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
          // Append below hand-written text, never replace it — the
          // assessor's own words are the record; the draft is a start.
          const existing = (finding.recommendation ?? "").trim();
          const merged = existing
            ? `${finding.recommendation}\n\n— AI draft —\n${draft}`
            : draft;
          db.findings.upsert({ ...finding, recommendation: merged });
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

/* ---------------- Peer review / approval ---------------- */

function ReviewPanel({
  assessment,
  onChanged,
}: {
  assessment: Assessment;
  onChanged: () => void;
}) {
  const [submitOpen, setSubmitOpen] = useState(false);
  const [decideOpen, setDecideOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [name, setName] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");

  const review = assessment.review;
  const completed = assessment.status === "completed";
  if (!completed && !review) return null;

  const assessors = db.assessors.list();
  const openSubmit = () => {
    setName(getProfile()?.name ?? "");
    setReviewerId("");
    setError("");
    setSubmitOpen(true);
  };
  const openDecide = () => {
    setName(getProfile()?.name ?? "");
    setComment("");
    setError("");
    setDecideOpen(true);
  };
  const doSubmit = () => {
    const reviewer = assessors.find((x) => x.id === reviewerId);
    const ok = submitForReview(assessment.id, {
      byName: name,
      reviewerId: reviewer?.id,
      reviewerName: reviewer?.name,
    });
    if (!ok) {
      setError("Your name is required to submit.");
      return;
    }
    setSubmitOpen(false);
    onChanged();
  };
  const doApprove = () => {
    if (!approveReview(assessment.id, { byName: name, comment })) {
      setError("Your name is required to approve.");
      return;
    }
    setDecideOpen(false);
    onChanged();
  };
  const doSendBack = () => {
    if (!comment.trim()) {
      setError("A comment is required when sending an assessment back — say what needs fixing.");
      return;
    }
    if (!sendBack(assessment.id, { byName: name, comment })) {
      setError("Your name is required to send back.");
      return;
    }
    setDecideOpen(false);
    onChanged();
  };

  return (
    <>
      {!review && completed && (
        <Card className="mb-4 border-violet-200 bg-violet-50/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-900">Peer review</p>
              <p className="mt-0.5 text-sm text-slate-500">
                Get a second pair of eyes on this assessment before the
                report goes to the client. Submitting locks it against
                edits until the reviewer decides.
              </p>
            </div>
            <Btn onClick={openSubmit}>Submit for review</Btn>
          </div>
        </Card>
      )}

      {review?.state === "pending" && (
        <Card className="mb-4 border-violet-300 bg-violet-50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-violet-900">
                ⏳ In review — locked for editing
              </p>
              <p className="mt-0.5 text-sm text-violet-800">
                Submitted {review.submittedAt.slice(0, 10)} by{" "}
                {review.submittedBy}
                {review.reviewerName
                  ? ` · awaiting ${review.reviewerName}`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Btn onClick={openDecide}>Review &amp; decide</Btn>
              <Btn variant="ghost" onClick={() => setWithdrawOpen(true)}>
                Withdraw
              </Btn>
            </div>
          </div>
        </Card>
      )}

      {review?.state === "approved" && (
        <Card className="mb-4 border-emerald-300 bg-emerald-50">
          <p className="font-semibold text-emerald-900">
            ✓ Approved by {review.decidedBy} ·{" "}
            {review.decidedAt?.slice(0, 10)}
          </p>
          {review.comment && (
            <p className="mt-1 text-sm text-emerald-800">
              “{review.comment}”
            </p>
          )}
          <p className="mt-1 text-xs text-emerald-700">
            This assessment is locked and its reports carry the approval
            stamp.
          </p>
        </Card>
      )}

      {review?.state === "sent_back" && (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-amber-900">
                ↩ Sent back by {review.decidedBy} ·{" "}
                {review.decidedAt?.slice(0, 10)}
              </p>
              {review.comment && (
                <p className="mt-1 text-sm text-amber-800">
                  “{review.comment}”
                </p>
              )}
              <p className="mt-1 text-xs text-amber-700">
                Unlocked — address the feedback, then resubmit.
              </p>
            </div>
            <Btn onClick={openSubmit}>Resubmit for review</Btn>
          </div>
        </Card>
      )}

      {withdrawOpen && (
        <ConfirmModal
          title="Withdraw this submission?"
          body="The assessment unlocks for editing and the review record is cleared."
          confirmLabel="Withdraw"
          danger
          onConfirm={() => {
            withdrawReview(assessment.id);
            onChanged();
          }}
          onClose={() => setWithdrawOpen(false)}
        />
      )}
      {submitOpen && (
        <Modal title="Submit for review" onClose={() => setSubmitOpen(false)}>
          <div className="space-y-4">
            <Field label="Your name">
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Who is submitting this?"
              />
            </Field>
            <Field label="Ask a specific reviewer (optional)">
              <select
                className={inputCls}
                value={reviewerId}
                onChange={(e) => setReviewerId(e.target.value)}
              >
                <option value="">Any reviewer</option>
                {assessors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Btn onClick={doSubmit} className="flex-1 sm:flex-none sm:px-8">
                Submit — lock assessment
              </Btn>
              <Btn variant="ghost" onClick={() => setSubmitOpen(false)}>
                Cancel
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {decideOpen && (
        <Modal title="Review & decide" onClose={() => setDecideOpen(false)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Reviewing <strong>{assessment.clientName}</strong> — submitted
              by {review?.submittedBy}. Approving stamps your name on the
              reports; sending back requires a comment and unlocks the
              assessment for fixes.
            </p>
            <Field label="Your name">
              <input
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Who is deciding?"
              />
            </Field>
            <Field label="Comment">
              <textarea
                className={`${inputCls} min-h-[80px]`}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Required to send back; optional on approval."
              />
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={doApprove}
                className="min-h-[44px] flex-1 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 sm:flex-none sm:px-6"
              >
                ✓ Approve
              </button>
              <button
                type="button"
                onClick={doSendBack}
                className="min-h-[44px] flex-1 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-white hover:bg-amber-600 sm:flex-none sm:px-6"
              >
                ↩ Send back
              </button>
              <Btn variant="ghost" onClick={() => setDecideOpen(false)}>
                Cancel
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/* Read-only walkthrough answers for a completed assessment — what a
 * reviewer (or anyone) needs to see the evidence behind the findings
 * without reopening the assessment for editing. */
function ReadOnlyAnswers({
  assessment,
  template,
}: {
  assessment: Assessment;
  template: AssessmentTemplate;
}) {
  const [open, setOpen] = useState(false);
  const byKey = useMemo(() => {
    const m = new Map<string, ResponseRow>();
    db.responses
      .filter((r) => r.assessmentId === assessment.id)
      .forEach((r) => m.set(r.checkpointKey, r));
    return m;
  }, [assessment.id]);
  const total = template.domains.reduce((n, d) => n + d.checkpoints.length, 0);
  const answered = template.domains.reduce(
    (n, d) =>
      n + d.checkpoints.filter((c) => byKey.get(c.key)?.answer != null).length,
    0
  );
  const chip = (a: string | null | undefined) =>
    a === "yes" ? (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Yes</span>
    ) : a === "no" ? (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">No</span>
    ) : a === "na" ? (
      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">N/A</span>
    ) : (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-400">No answer</span>
    );

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="font-semibold text-gray-900">
          Walkthrough answers{" "}
          <span className="text-sm font-normal text-gray-500">
            ({answered}/{total} answered — read-only)
          </span>
        </span>
        <span aria-hidden className="text-violet-500">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-5 border-t border-gray-100 pt-4">
          {template.domains.map((d, i) => (
            <div key={d.id}>
              <p className="mb-2 text-sm font-semibold text-gray-700">
                {i + 1}. {d.name}
              </p>
              <ul className="divide-y divide-gray-50">
                {d.checkpoints.map((c) => {
                  const r = byKey.get(c.key);
                  return (
                    <li key={c.key} className="flex items-start justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800">{c.text}</p>
                        {r?.note && (
                          <p className="mt-0.5 text-xs italic text-gray-500">
                            “{r.note}”
                          </p>
                        )}
                        {r?.photoIds && r.photoIds.length > 0 && (
                          <p className="mt-0.5 text-xs text-gray-400">
                            📷 {r.photoIds.length} photo{r.photoIds.length === 1 ? "" : "s"} attached
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {r?.answer === "no" && r.risk && (
                          <RiskBadge risk={r.risk} />
                        )}
                        {chip(r?.answer)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ReviewStep({
  assessment,
  template,
  onReopen,
}: {
  assessment: Assessment;
  template: AssessmentTemplate;
  onReopen?: () => void;
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
          {onReopen && (
            <Btn variant="ghost" onClick={onReopen}>
              Reopen walkthrough
            </Btn>
          )}
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

      <ReadOnlyAnswers assessment={assessment} template={template} />
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
  const [switching, setSwitching] = useState(false);
  const [reassessing, setReassessing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [unansweredOnly, setUnansweredOnly] = useState(false);

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
  // Count only responses that belong to the CURRENT template — after a
  // template switch, answers recorded against the old template's
  // checkpoints remain stored and used to push progress past 100%
  // (or negative via unanswered).
  const templateKeys = new Set(
    template.domains.flatMap((d) => d.checkpoints.map((c) => c.key))
  );
  const answered = Object.entries(responses).filter(
    ([k, r]) => templateKeys.has(k) && r.answer !== null
  ).length;
  const unanswered = Math.max(0, total - answered);
  const pct = total
    ? Math.min(100, Math.max(0, Math.round((answered / total) * 100)))
    : 0;
  const completed = assessment.status === "completed";
  const locked = isReviewLocked(assessment);
  const views = domainViews(template, responses, unansweredOnly);

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
          <div className="flex flex-wrap items-center gap-2">
            {!locked && (
              <Btn variant="ghost" onClick={() => setSwitching(true)}>
                ⇄ Template
              </Btn>
            )}
            {completed && (
              <Btn variant="ghost" onClick={() => setReassessing(true)}>
                ↻ Reassess
              </Btn>
            )}
            {!completed ? (
              <Btn onClick={() => setConfirming(true)}>Complete assessment</Btn>
            ) : (
              <StatusPill status="completed" />
            )}
          </div>
        }
      />
      {mode === "prod" && <ProdNotice />}
      {isTemplateMissing(assessment.templateId) && (
        <p
          className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800"
          role="alert"
        >
          ⚠ This assessment's template isn't on this device (it may have been
          deleted, or the assessment arrived in a backup from another
          device). It's being shown against the {template.name} as a
          stand-in — answers recorded against the original template's
          checkpoints won't appear. Use ⇄ Template to assign the right one.
        </p>
      )}
      <ReviewPanel assessment={assessment} onChanged={() => setTick((t) => t + 1)} />

      {completed ? (
        <ReviewStep
          assessment={assessment}
          template={template}
          onReopen={locked ? undefined : reopen}
        />
      ) : (
        <>
          {/* Cover strip */}
          <Card className="mb-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-gray-400">Date</p>
                <p className="font-medium">{assessment.cover?.date || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Lead assessor</p>
                <p className="font-medium">
                  {teamAssessors[0]?.name || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Escort</p>
                <p className="font-medium">{assessment.cover?.escort || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Weather</p>
                <p className="font-medium">{assessment.cover?.weather || "—"}</p>
              </div>
            </div>
            {assessment.focusNotes && (
              <p className="mt-3 border-t border-gray-100 pt-3 text-sm text-gray-600">
                <span className="font-medium text-gray-700">Focus: </span>
                {assessment.focusNotes}
              </p>
            )}
          </Card>

          {/* FSL determination (ISC RMP §4) — gated behind a "This is a federal
              facility" checkbox; the section only appears when checked. */}
          <FslWizard assessmentId={assessment.id} />

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
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={unansweredOnly}
                onClick={() => setUnansweredOnly((v) => !v)}
                className={`flex min-h-[44px] items-center rounded-full px-4 text-xs font-semibold transition-colors ${
                  unansweredOnly
                    ? "bg-slate-800 text-white"
                    : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                }`}
              >
                {unansweredOnly
                  ? `✓ Unanswered only (${unanswered} left) — show all`
                  : `Unanswered only (${unanswered} left)`}
              </button>
              {unansweredOnly && unanswered === 0 && (
                <span className="text-xs font-medium text-emerald-700">
                  All checkpoints answered ✓
                </span>
              )}
            </div>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {views.map((v, i) => (
                <a
                  key={v.domain.id}
                  href={`#domain-${v.domain.id}`}
                  className="flex min-h-[44px] shrink-0 items-center rounded-full border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-100"
                >
                  {v.complete ? "✓ " : ""}
                  {i + 1}. {v.domain.name}
                  {!v.complete && unansweredOnly
                    ? ` (${v.unanswered} left)`
                    : ""}
                </a>
              ))}
            </div>
          </div>

          {/* Domains */}
          <div className="space-y-8">
            {views.map((v, i) => {
              const d = v.domain;
              if (unansweredOnly && v.complete) {
                return (
                  <section
                    key={d.id}
                    id={`domain-${d.id}`}
                    className="scroll-mt-40"
                  >
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
                      <h2 className="text-sm font-semibold text-emerald-800">
                        ✓ {i + 1}. {d.name}
                      </h2>
                      <Badge tone="green">
                        {v.answered}/{v.total} answered
                      </Badge>
                    </div>
                  </section>
                );
              }
              return (
                <section key={d.id} id={`domain-${d.id}`} className="scroll-mt-40">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-lg font-bold">
                      {i + 1}. {d.name}
                    </h2>
                    <Badge tone={v.complete ? "green" : "gray"}>
                      {v.answered}/{v.total}
                    </Badge>
                  </div>
                  <div className="space-y-3">
                    {v.checkpoints.map((c) => (
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

          {unansweredOnly && unanswered === 0 && (
            <Card className="mt-8 text-center">
              <p className="text-sm font-semibold text-gray-800">
                All checkpoints answered ✓
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Nothing is left unanswered in this walkthrough. Show all
                checkpoints to review or change an answer.
              </p>
              <div className="mt-3">
                <Btn onClick={() => setUnansweredOnly(false)}>
                  Show all checkpoints
                </Btn>
              </div>
            </Card>
          )}

          <div className="mt-8">
            <Btn onClick={() => setConfirming(true)} className="w-full sm:w-auto">
              Complete assessment
            </Btn>
          </div>
        </>
      )}

      {/* Danger zone */}
      {!locked && (
      <div className="mt-8 rounded-2xl border border-red-200 bg-red-50/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-red-800">
              Delete this assessment
            </p>
            <p className="mt-0.5 text-xs text-red-600">
              Removes the assessment and everything derived from it. For
              mistakes and test data — export a backup first if unsure.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDeleting(true)}
            className="min-h-[44px] rounded-lg border border-red-300 bg-white px-4 text-sm font-semibold text-red-700 hover:bg-red-100"
          >
            🗑 Delete assessment
          </button>
        </div>
      </div>
      )}

      {deleting && (
        <Modal title="Delete this assessment?" onClose={() => setDeleting(false)}>
          {(() => {
            const c = countAssessmentData(assessment.id);
            const parts = [
              c.responses ? `${c.responses} response${c.responses === 1 ? "" : "s"}` : null,
              c.findings ? `${c.findings} finding${c.findings === 1 ? "" : "s"}` : null,
              c.reports ? `${c.reports} report${c.reports === 1 ? "" : "s"}` : null,
              c.equipment ? `${c.equipment} equipment item${c.equipment === 1 ? "" : "s"}` : null,
              c.fslRecords ? "its FSL record" : null,
            ].filter(Boolean);
            return (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  <strong>{assessment.clientName}</strong> — this permanently
                  removes the assessment
                  {parts.length ? `, including ${parts.join(", ")}` : ""}.
                  {c.schedulesUnlinked > 0 &&
                    " The linked schedule entry stays and is unlinked."}{" "}
                  This cannot be undone.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      deleteAssessmentCascade(assessment.id);
                      router.push("/assessments");
                    }}
                    className="min-h-[44px] flex-1 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 sm:flex-none sm:px-8"
                  >
                    Delete permanently
                  </button>
                  <Btn variant="ghost" onClick={() => setDeleting(false)}>
                    Cancel
                  </Btn>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}
      {switching && (
        <TemplatePickerModal
          assessment={assessment}
          onClose={() => setSwitching(false)}
          onChanged={() => setTick((t) => t + 1)}
        />
      )}
      {reassessing && (
        <ReassessModal
          source={assessment}
          onClose={() => setReassessing(false)}
          onCreated={(id) => router.push(`/assessments/${id}`)}
        />
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
