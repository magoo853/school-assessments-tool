/**
 * GET /api/ai-health — reports whether AI drafting is configured and
 * whether the configured key actually works. Never exposes the key.
 * Default provider: Google Gemini (free tier) via its OpenAI-compatible
 * endpoint. AI_API_BASE / AI_MODEL env vars override.
 */
import { NextResponse } from "next/server";

const AI_API_BASE =
  process.env.AI_API_BASE?.replace(/\/+$/, "") ||
  "https://generativelanguage.googleapis.com/v1beta/openai";
const AI_MODEL = process.env.AI_MODEL || "gemini-3.8-flash";

export async function GET() {
  const key = process.env.AI_API_KEY;
  const provider = AI_API_BASE.includes("generativelanguage.googleapis.com")
    ? "Google Gemini (free tier)"
    : AI_API_BASE;
  if (!key) {
    return NextResponse.json({
      configured: false,
      working: false,
      provider,
      model: AI_MODEL,
    });
  }
  try {
    const res = await fetch(`${AI_API_BASE}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    return NextResponse.json({
      configured: true,
      working: res.ok,
      provider,
      model: AI_MODEL,
      status: res.status,
    });
  } catch {
    return NextResponse.json({
      configured: true,
      working: false,
      provider,
      model: AI_MODEL,
    });
  }
}

/** POST { apiKey } — test a device-stored key without saving it server-side. */
export async function POST(req: Request) {
  let key = "";
  try {
    const body = (await req.json()) as { apiKey?: unknown };
    if (typeof body.apiKey === "string") key = body.apiKey.trim().slice(0, 300);
  } catch {
    /* fall through with empty key */
  }
  if (!key) {
    return NextResponse.json({ working: false, error: "No key provided" });
  }
  try {
    const res = await fetch(`${AI_API_BASE}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    return NextResponse.json({ working: res.ok, status: res.status });
  } catch {
    return NextResponse.json({ working: false });
  }
}
