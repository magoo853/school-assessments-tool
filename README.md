# School Assessments Tool

Standalone school-safety assessment app for independent assessors. Hub-style
build: Next.js + Supabase + Vercel, private repo.

## What's here

- Assessment walkthroughs (ISC-aligned, plus FL/LA templates)
- AI-assisted drafting for findings and reports (editable in-app)
- AAR, Findings, and Recommendations reports (markdown) with equipment section
- Assessor directory with clearance tracking
- Schedule dispatch board with reassessment tracking
- Clery Act ASR builder + Policy Docs library
- Demo data + demo/prod toggle

## Develop

```sh
npm install
npm run dev
```

## Deploy

Vercel, from the `main` branch. Supabase env vars enable live mode;
without them the app runs in demo mode.

## AI-assisted drafting

`POST /api/draft` is the server-side drafting endpoint used by the
"Draft with AI" buttons in the walkthrough and report editor. It is
server-only — the API key never reaches the client, is never logged,
and is never echoed in responses.

Environment variables (all server-side; whoever deploys brings their
own key):

- `AI_API_KEY` — Bearer token for the chat-completions API. Required.
- `AI_API_BASE` — OpenAI-compatible chat-completions base URL.
  Default: `https://api.openai.com/v1`.
- `AI_MODEL` — Model name. Default: `gpt-4o-mini`.

Contract:

- Request: `{ section: "finding" | "aar" | "recommendations" | "executive-summary", data: <structured assessment JSON>, existingDraft?: string }`
  (`data` carries template info, responses with answer/risk/notes,
  findings, and equipment — the endpoint trims it to the minimum the
  requested section needs.)
- `200` → `{ draft: string (markdown), model: string }`
- `400` → `{ error: { code: "INVALID_REQUEST", message } }`
- `503` → `{ error: { code: "AI_NOT_CONFIGURED", message } }` when no
  `AI_API_KEY` is set. The UI falls back to in-app template-based
  drafts in this case.
- `502` → `{ error: { code: "AI_UPSTREAM_ERROR", message } }` on
  upstream failure (no key or raw upstream body is ever leaked).

Drafting rules baked into the system prompt: draft ONLY from the data
provided (never invent incidents, numbers, names, or details); failed
checkpoints keep negative gap-statement framing; concise,
professional, human tone.
