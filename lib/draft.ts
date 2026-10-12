/**
 * Client helper for the server-side drafting endpoint (POST /api/draft).
 * The API key never reaches the client — the route handler owns it.
 * No key configured → 503 AI_NOT_CONFIGURED → caller falls back to
 * template-based drafts with a subtle hint.
 */
"use client";

export type DraftSection =
  | "finding"
  | "aar"
  | "recommendations"
  | "executive-summary";

export type DraftResult =
  | { ok: true; draft: string; model: string }
  | { ok: false; code: string; message: string };

export const AI_NOT_CONFIGURED_HINT =
  "AI drafting is off until a key is added — see Integrations for the free Google AI Studio key";

export async function requestDraft(
  section: DraftSection,
  data: unknown,
  existingDraft?: string
): Promise<DraftResult> {
  try {
    const res = await fetch("/api/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section, data, existingDraft }),
    });
    const json = (await res.json().catch(() => null)) as {
      draft?: string;
      model?: string;
      error?: { code?: string; message?: string };
    } | null;
    if (res.ok && json && typeof json.draft === "string") {
      return { ok: true, draft: json.draft, model: json.model ?? "unknown" };
    }
    const code = json?.error?.code ?? `HTTP_${res.status}`;
    const message = json?.error?.message ?? "Drafting failed";
    return { ok: false, code, message };
  } catch {
    return { ok: false, code: "NETWORK_ERROR", message: "Drafting failed" };
  }
}
