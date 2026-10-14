/**
 * Client helper for the server-side drafting endpoint (POST /api/draft).
 * Key resolution server-side: a per-request key from the in-app
 * Integrations setting (stored on this device only) wins; otherwise
 * the server's AI_API_KEY env var. No key → 503 AI_NOT_CONFIGURED →
 * caller falls back to template-based drafts with a subtle hint.
 */
"use client";

import { getAiKey } from "./aiSettings";

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
  // Client-side timeout (~35s, just past the server's 28s chain
  // budget): without it, a hung connection left the button on
  // "Drafting…" indefinitely in the field.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35_000);
  try {
    const apiKey = getAiKey();
    const res = await fetch("/api/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        section,
        data,
        existingDraft,
        ...(apiKey ? { apiKey } : {}),
      }),
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
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return {
        ok: false,
        code: "TIMEOUT",
        message: "Drafting timed out — check your connection and try again.",
      };
    }
    return {
      ok: false,
      code: "NETWORK_ERROR",
      message: "Couldn't reach the drafting service — check your connection.",
    };
  } finally {
    clearTimeout(timer);
  }
}
