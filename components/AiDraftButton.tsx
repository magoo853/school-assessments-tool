/**
 * "Draft with AI" button. Calls POST /api/draft; on 503 AI_NOT_CONFIGURED
 * shows a subtle hint instead (caller keeps template-based fallback).
 */
"use client";

import { useState } from "react";
import { Badge, Btn } from "./ui";
import { useAiEnabled } from "@/lib/aiSettings";
import {
  AI_NOT_CONFIGURED_HINT,
  requestDraft,
  type DraftSection,
} from "@/lib/draft";

export function AiDraftBadge() {
  return <Badge tone="blue">✨ AI draft</Badge>;
}

export default function AiDraftButton({
  section,
  getData,
  existingDraft,
  onInsert,
  label = "Draft with AI",
}: {
  section: DraftSection;
  getData: () => unknown;
  existingDraft?: string;
  onInsert: (draft: string) => void;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [aiOn] = useAiEnabled();

  if (!aiOn) return null;

  const click = async () => {
    setBusy(true);
    setHint(null);
    setErr(null);
    const r = await requestDraft(section, getData(), existingDraft);
    if (r.ok) {
      onInsert(r.draft);
    } else if (r.code === "AI_NOT_CONFIGURED") {
      setHint(AI_NOT_CONFIGURED_HINT);
    } else {
      setErr("Drafting failed — try again");
    }
    setBusy(false);
  };

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Btn variant="ghost" onClick={click} disabled={busy}>
        {busy ? "Drafting…" : `✨ ${label}`}
      </Btn>
      {hint && <span className="text-xs text-gray-500">{hint}</span>}
      {err && <span className="text-xs text-red-600">{err}</span>}
    </span>
  );
}
