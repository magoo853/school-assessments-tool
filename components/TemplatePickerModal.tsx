/**
 * Change an existing assessment's template.
 * Responses are keyed by checkpoint, so switching templates re-derives
 * findings from the responses that match the new template's checkpoints
 * (deriveFindings replaces the assessment's findings). The user is
 * warned when the assessment already has answers.
 */
"use client";

import { useMemo, useState } from "react";
import { db, type Assessment } from "@/lib/store";
import { allTemplates } from "@/lib/customTemplates";
import { templateSize } from "@/lib/templates";
import { deriveFindings } from "@/lib/findings";
import { Modal, Btn, Badge } from "@/components/ui";

export default function TemplatePickerModal({
  assessment,
  onClose,
  onChanged,
}: {
  assessment: Assessment;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [picked, setPicked] = useState(assessment.templateId);
  const options = useMemo(() => allTemplates(), []);
  const answered = useMemo(
    () => db.responses.filter((r) => r.assessmentId === assessment.id).length,
    [assessment.id]
  );
  const changed = picked !== assessment.templateId;

  const apply = () => {
    db.assessments.upsert({
      ...assessment,
      templateId: picked,
    });
    // Findings are derived data — rebuild them against the new template.
    deriveFindings(assessment.id);
    onChanged?.();
    onClose();
  };

  return (
    <Modal title={`Change template — ${assessment.clientName}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Pick the walkthrough template this assessment should use. The
          template decides the checkpoints and domains.
        </p>
        <div className="space-y-2">
          {options.map(({ template: t, custom }) => {
            const isPicked = picked === t.id;
            const isCurrent = assessment.templateId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setPicked(t.id)}
                aria-pressed={isPicked}
                className={`flex min-h-[56px] w-full items-start gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition ${
                  isPicked
                    ? "border-violet-500 bg-violet-50"
                    : "border-slate-200 bg-white hover:border-violet-300"
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
                    isPicked
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-slate-300 text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                    {t.name}
                    {custom ? (
                      <Badge tone="violet">Custom</Badge>
                    ) : (
                      <Badge tone="gray">System</Badge>
                    )}
                    {isCurrent && <Badge tone="blue">Current</Badge>}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {templateSize(t)} checkpoints · {t.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {changed && answered > 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            ⚠ This assessment already has {answered} answered checkpoint
            {answered === 1 ? "" : "s"}. Checkpoints differ between templates —
            answers that don&apos;t match the new template won&apos;t appear,
            and its findings will be rebuilt from the answers that do match.
            Nothing is deleted; switching back restores them.
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Btn onClick={apply} disabled={!changed} className="flex-1 sm:flex-none sm:px-8">
            Switch template
          </Btn>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
