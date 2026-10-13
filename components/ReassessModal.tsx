/**
 * Confirm + start a reassessment pre-loaded from a completed
 * assessment. Shared by the assessments list and the assessment page.
 */
"use client";

import { type Assessment } from "@/lib/store";
import { startReassessment } from "@/lib/reassess";
import { Modal, Btn } from "@/components/ui";

export default function ReassessModal({
  source,
  onClose,
  onCreated,
}: {
  source: Assessment;
  onClose: () => void;
  onCreated: (newId: string) => void;
}) {
  const sourceDate = (source.completedAt ?? source.createdAt).slice(0, 10);

  const start = () => {
    const target = startReassessment(source);
    onCreated(target.id);
  };

  return (
    <Modal title={`Reassess ${source.clientName}?`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Starts a new assessment for {source.campus} using the same
          template, pre-loaded with the answers, risk ratings, and notes
          from the assessment completed {sourceDate}. Walk the campus and
          only change what&apos;s different.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Photos stay with the original assessment — they&apos;re evidence of that visit.</li>
          <li>Findings re-derive from the carried-over answers; their corrective actions start open.</li>
          <li>The original assessment is not changed.</li>
        </ul>
        <div className="flex flex-wrap gap-2 pt-1">
          <Btn onClick={start} className="flex-1 sm:flex-none sm:px-8">
            ↻ Start reassessment
          </Btn>
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
