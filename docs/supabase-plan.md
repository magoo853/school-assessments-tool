# Supabase plan — School Assessments Tool

Status: **PREP ONLY.** Schema written (`supabase/migrations/0001_init.sql`),
nothing applied, app still runs 100% on per-device localStorage.

## Why
Today every device keeps its own dataset (localStorage). A sellable product
needs shared data across an assessor team, real backup, and eventually
accounts. Supabase gives Postgres + Auth + Storage with tenant isolation
via Row Level Security.

## The one thing needed from James
1. Create a NEW Supabase project in his account — separate from the Code
   Red Hub project (different product, different customers).
2. Provide the project URL + anon key (Project Settings → API).
   (Or say the word and the project gets created with him signed in.)

## What happens then (Jarvis)
1. Run `supabase/migrations/0001_init.sql` on the new project.
2. Add `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the
   Vercel project env (James adds env vars, or grants access).
3. Swap the backend of the `Table` class in `lib/store.ts` to Supabase
   behind the SAME API (`list/get/upsert/remove/filter`) so app pages
   don't change. DEMO mode keeps the local seed exactly as today; PROD
   mode reads/writes Supabase.
4. One-time device migration: the Backup file (Reports → Backup & Restore)
   imports into the tenant — assessments, responses, findings, reports,
   equipment, assessors, schedules, clery, policy docs, custom templates,
   FSL records; photos upload to the `evidence` Storage bucket.
5. Verify tenant isolation with two test tenants before any real data.

## Phase 2 — accounts (after shared storage works)
- Supabase Auth, passwordless email magic links (same call as the Hub).
- First login creates/joins a tenant; invite flow for team members.
- My Profile + report branding move from localStorage to per-user rows.
- Roles: owner / admin / assessor (already in `tenant_members`).

## Deliberate non-goals for phase 1
- No realtime collaboration editing (last-write-wins is fine for v1).
- No changes to the Hub or the sat-hub-exchange format.
- DEMO mode never touches the network database.

## Privacy notes
- Schools' data lives in the assessor's tenant; RLS denies cross-tenant
  reads at the database layer, not just in app code.
- Before real school data is sent to the AI drafting endpoint, re-check
  the LLM vendor's data terms (already flagged in the product notes).

## Build note (2026-10-15)
- Vercel skips builds for commits that touch only documentation,
  markdown, or meta files (see `ignoreCommand` in vercel.json). Docs
  in this repo can therefore lag the live build by design; the code
  is the source of truth for what is deployed.
