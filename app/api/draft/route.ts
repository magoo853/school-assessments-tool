/**
 * Slice 7 — LLM-assisted drafting endpoint.
 *
 * POST /api/draft
 *
 * Request:  { section: "finding" | "aar" | "recommendations" | "executive-summary",
 *             data: <structured assessment JSON>, existingDraft?: string }
 * Responses:
 *   200 { draft: string, model: string }
 *   400 { error: { code: "INVALID_REQUEST", message } }
 *   502 { error: { code: "AI_UPSTREAM_ERROR", message } }
 *   503 { error: { code: "AI_NOT_CONFIGURED", message } }
 *
 * Server-only: the API key is read from process.env here, never sent to the
 * client, never logged, never echoed in responses.
 */

import { NextRequest, NextResponse } from "next/server";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

const SECTIONS = ["finding", "aar", "recommendations", "executive-summary"] as const;
type DraftSection = (typeof SECTIONS)[number];

interface ResponseSummary {
  checkpointKey: string;
  answer: "yes" | "no" | "na" | null;
  risk: "low" | "moderate" | "high" | null;
  note: string;
}

interface FindingSummary {
  gapText: string;
  risk: "low" | "moderate" | "high";
  note: string;
  recommendation: string;
}

interface EquipmentSummary {
  name: string;
  detail: string;
  priority: "low" | "moderate" | "high";
}

interface DraftData {
  clientName?: string;
  campus?: string;
  templateId?: string;
  responses?: ResponseSummary[];
  findings?: FindingSummary[];
  equipment?: EquipmentSummary[];
  strengths?: string[];
}

/* ------------------------------------------------------------------ */
/* Config (env only, server-side)                                       */
/* ------------------------------------------------------------------ */

const AI_API_BASE =
  process.env.AI_API_BASE?.replace(/\/+$/, "") ||
  "https://generativelanguage.googleapis.com/v1beta/openai";
const AI_MODEL = process.env.AI_MODEL || "gemini-3.8-flash";
/** Tried in order when the primary model errors (retired/renamed models 404). */
const AI_MODEL_FALLBACKS = ["gemini-3.6-flash", "gemini-3.5-flash-lite"];

const SYSTEM_PROMPT =
  "You are a school-safety assessment report writer. Draft ONLY from the data provided — " +
  "never invent incidents, numbers, names, or details not present in the data. " +
  "Failed checkpoints keep negative gap-statement framing (describe what is missing or " +
  "inadequate, never the positive criterion). Concise, professional, human tone — " +
  "plain language, no hype, no AI-sounding filler.";

/* Payload guards: keep payloads small and trim note text. */
const MAX_NOTE_CHARS = 280;
const MAX_ITEMS = 40;

function clampText(value: unknown, max: number): string {
  const s = typeof value === "string" ? value.trim() : "";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function pickFinding(f: unknown): FindingSummary | null {
  if (typeof f !== "object" || f === null) return null;
  const o = f as Record<string, unknown>;
  if (typeof o.gapText !== "string" || !o.gapText.trim()) return null;
  return {
    gapText: clampText(o.gapText, MAX_NOTE_CHARS),
    risk: o.risk === "high" || o.risk === "moderate" ? o.risk : "low",
    note: clampText(o.note, MAX_NOTE_CHARS),
    recommendation: clampText(o.recommendation, MAX_NOTE_CHARS),
  };
}

function pickEquipment(e: unknown): EquipmentSummary | null {
  if (typeof e !== "object" || e === null) return null;
  const o = e as Record<string, unknown>;
  if (typeof o.name !== "string" || !o.name.trim()) return null;
  return {
    name: clampText(o.name, 120),
    detail: clampText(o.detail, MAX_NOTE_CHARS),
    priority: o.priority === "high" || o.priority === "moderate" ? o.priority : "low",
  };
}

function pickResponse(r: unknown): ResponseSummary | null {
  if (typeof r !== "object" || r === null) return null;
  const o = r as Record<string, unknown>;
  if (typeof o.checkpointKey !== "string" || !o.checkpointKey.trim()) return null;
  const answer = o.answer === "yes" || o.answer === "no" || o.answer === "na" ? o.answer : null;
  const risk = o.risk === "low" || o.risk === "moderate" || o.risk === "high" ? o.risk : null;
  return {
    checkpointKey: clampText(o.checkpointKey, 120),
    answer,
    risk,
    note: clampText(o.note, MAX_NOTE_CHARS),
  };
}

/** Reduce the raw request data to the minimum the model needs per section. */
function summarize(section: DraftSection, raw: unknown): DraftData {
  const o = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const findings: FindingSummary[] = Array.isArray(o.findings)
    ? o.findings.map(pickFinding).filter((f): f is FindingSummary => f !== null).slice(0, MAX_ITEMS)
    : [];
  const equipment: EquipmentSummary[] = Array.isArray(o.equipment)
    ? o.equipment.map(pickEquipment).filter((e): e is EquipmentSummary => e !== null).slice(0, MAX_ITEMS)
    : [];
  const responses: ResponseSummary[] = Array.isArray(o.responses)
    ? o.responses.map(pickResponse).filter((r): r is ResponseSummary => r !== null).slice(0, MAX_ITEMS)
    : [];
  const strengths: string[] = Array.isArray(o.strengths)
    ? o.strengths
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => clampText(s, MAX_NOTE_CHARS))
        .slice(0, 12)
    : [];

  const base: DraftData = {
    clientName: typeof o.clientName === "string" ? clampText(o.clientName, 120) : undefined,
    campus: typeof o.campus === "string" ? clampText(o.campus, 120) : undefined,
    templateId: typeof o.templateId === "string" ? clampText(o.templateId, 40) : undefined,
  };

  switch (section) {
    case "finding":
      // Only the first finding matters: one narrative for one finding.
      return { ...base, findings: findings.slice(0, 1) };
    case "executive-summary":
      // Counts + risk mix; individual notes not needed.
      return { ...base, responses, findings: findings.map((f) => ({ ...f, note: "" })), equipment };
    case "aar":
      return { ...base, findings, strengths, equipment };
    case "recommendations":
      return { ...base, findings, equipment };
  }
}

/** Section-specific instructions appended to the user message. */
function sectionInstruction(section: DraftSection): string {
  switch (section) {
    case "finding":
      return (
        "Write a 2–3 sentence narrative for this single finding. Cover the gap " +
        "(negative gap-statement framing: what is missing or inadequate), any observed " +
        "detail from the notes, and the risk implication. Do not write a headline."
      );
    case "executive-summary":
      return (
        "Write a 3–5 sentence executive summary of the assessment from the counts: " +
        "scope, how many checkpoints were failed by risk level, and the equipment " +
        "picture. No invented detail."
      );
    case "aar":
      return (
        "Draft the after-action report body in markdown from the findings and " +
        "strengths: a short summary, then findings with their gap statements and " +
        "recommendations. Keep it tight and professional."
      );
    case "recommendations":
      return (
        "Draft prioritized recommendation bullets in markdown, ordered by risk " +
        "(high first). Mention relevant equipment where the data ties it to a " +
        "recommendation. Each bullet is one clear action, no filler."
      );
  }
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

interface ValidatedBody {
  section: DraftSection;
  data: unknown;
  existingDraft?: string;
  /** Optional per-request key from the in-app Integrations setting
   *  (stored on the user's device). Falls back to the server env key. */
  apiKey?: string;
}

function validateBody(raw: unknown): ValidatedBody | { error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { error: "Request body must be a JSON object." };
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.section !== "string" || !SECTIONS.includes(o.section as DraftSection)) {
    return { error: `Invalid section. Must be one of: ${SECTIONS.join(", ")}.` };
  }
  if (typeof o.data !== "object" || o.data === null) {
    return { error: "Request body must include a data object." };
  }
  if (o.existingDraft !== undefined && typeof o.existingDraft !== "string") {
    return { error: "existingDraft must be a string when provided." };
  }
  if (o.apiKey !== undefined && typeof o.apiKey !== "string") {
    return { error: "apiKey must be a string when provided." };
  }
  return {
    section: o.section as DraftSection,
    data: o.data,
    existingDraft: typeof o.existingDraft === "string" ? o.existingDraft.slice(0, 4000) : undefined,
    apiKey:
      typeof o.apiKey === "string" && o.apiKey.trim()
        ? o.apiKey.trim().slice(0, 300)
        : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Upstream call                                                       */
/* ------------------------------------------------------------------ */

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

async function callUpstream(
  userMessage: string,
  key: string | undefined
): Promise<{ draft: string; model: string }> {
  if (!key) {
    throw Object.assign(new Error("not configured"), { code: "AI_NOT_CONFIGURED" });
  }

  const models = Array.from(new Set([AI_MODEL, ...AI_MODEL_FALLBACKS]));
  let lastStatus = 0;
  for (const model of models) {
    let res: Response;
    try {
      res = await fetch(`${AI_API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          temperature: 0.4,
          max_tokens: 1500,
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw Object.assign(new Error("AI service unreachable."), { code: "AI_UPSTREAM_ERROR" });
    }

    if (!res.ok) {
      // Intentionally do NOT include the upstream body — it may leak internals.
      // Auth failures won't heal by switching models; everything else might.
      lastStatus = res.status;
      if (res.status === 401 || res.status === 403) break;
      continue;
    }

    let json: ChatCompletionResponse;
    try {
      json = (await res.json()) as ChatCompletionResponse;
    } catch {
      throw Object.assign(new Error("AI service returned an invalid response."), {
        code: "AI_UPSTREAM_ERROR",
      });
    }

    const draft = json.choices?.[0]?.message?.content?.trim();
    if (!draft) {
      throw Object.assign(new Error("AI service returned an empty draft."), {
        code: "AI_UPSTREAM_ERROR",
      });
    }
    return { draft, model };
  }

  throw Object.assign(new Error(`AI service returned status ${lastStatus}.`), {
    code: "AI_UPSTREAM_ERROR",
  });
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

function errorJson(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorJson("INVALID_REQUEST", "Request body must be valid JSON.", 400);
  }

  const body = validateBody(raw);
  if ("error" in body) {
    return errorJson("INVALID_REQUEST", body.error, 400);
  }

  const apiKey = body.apiKey || process.env.AI_API_KEY;
  if (!apiKey) {
    return errorJson(
      "AI_NOT_CONFIGURED",
      "AI drafting is not configured. Add a free Google AI Studio key in Integrations to enable it.",
      503
    );
  }

  const summary = summarize(body.section, body.data);
  if (body.section === "finding" && (!summary.findings || summary.findings.length === 0)) {
    return errorJson("INVALID_REQUEST", "A 'finding' draft requires at least one finding in data.findings.", 400);
  }

  const userMessage = [
    sectionInstruction(body.section),
    "",
    "Assessment data:",
    JSON.stringify(summary),
    ...(body.existingDraft
      ? [
          "",
          "Existing draft (revise and improve it, keeping all facts from the data):",
          body.existingDraft,
        ]
      : []),
  ].join("\n");

  try {
    const { draft, model } = await callUpstream(userMessage, apiKey);
    return NextResponse.json({ draft, model }, { status: 200 });
  } catch (err) {
    const code =
      err instanceof Error && "code" in err && typeof (err as { code: unknown }).code === "string"
        ? (err as { code: string }).code
        : "AI_UPSTREAM_ERROR";
    if (code === "AI_NOT_CONFIGURED") {
      return errorJson(
        "AI_NOT_CONFIGURED",
        "AI drafting is not configured. Add a free Google AI Studio key in Integrations to enable it.",
        503
      );
    }
    const message = err instanceof Error ? err.message : "AI drafting failed.";
    return errorJson("AI_UPSTREAM_ERROR", message, 502);
  }
}
