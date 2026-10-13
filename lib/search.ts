/**
 * Global search — pure functions, no React, no store access.
 *
 * One header search box jumps to clients, assessments, findings, and
 * reports by text. This module takes plain table snapshots (the caller
 * reads `db` in lib/store) so it can be tested outside the browser.
 *
 * Matching: the query is split into tokens; EVERY token must appear
 * somewhere in a candidate's searchable text (title + subtitle + extra
 * fields such as a finding's note / recommendation or an assessment's
 * focus notes). Ranking favours title matches, then exact-phrase
 * matches, so the thing the user named surfaces first. Results are
 * returned best-first; the UI groups them by kind for display.
 *
 * Deep links reuse routes the app already honours:
 *  - client     → /clients?client=<name>   (clients page reads ?client)
 *  - assessment → /assessments/<id>
 *  - finding    → /findings?q=<gap text>   (findings page reads ?q)
 *  - report     → /reports/<id>
 * No data-model change: this only reads existing tables.
 */

import type {
  Assessment,
  Finding,
  ReportDoc,
  ScheduleItem,
} from "./store";

export type SearchKind = "client" | "assessment" | "finding" | "report";

export interface SearchResult {
  kind: SearchKind;
  /** Stable key for React lists / aria ids: `${kind}:${id-or-name}`. */
  key: string;
  title: string;
  subtitle: string;
  href: string;
  score: number;
}

export interface SearchData {
  assessments: Assessment[];
  findings: Finding[];
  reports: ReportDoc[];
  schedules: ScheduleItem[];
}

/** Kind labels for report subtitles (mirrors REPORT_LABELS in lib/reports). */
const REPORT_KIND_LABELS: Record<ReportDoc["kind"], string> = {
  aar: "After-Action Report",
  findings: "Findings Report",
  recommendations: "Recommendations Report",
};

const STATUS_LABELS: Record<Assessment["status"], string> = {
  draft: "Draft",
  in_progress: "In progress",
  completed: "Completed",
};

/** Lowercase, collapse whitespace, trim. Matching is case-insensitive. */
export function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Split a raw query into normalized tokens (empty query → []). */
export function searchTokens(query: string): string[] {
  const normalized = normalizeSearchText(query);
  return normalized ? normalized.split(" ") : [];
}

interface Candidate {
  kind: SearchKind;
  key: string;
  title: string;
  subtitle: string;
  href: string;
  /** Lower-priority searchable text (notes, recommendations, …). */
  extra: string;
}

function scoreCandidate(c: Candidate, query: string, tokens: string[]): number | null {
  const title = normalizeSearchText(c.title);
  const haystack = normalizeSearchText(`${c.title} ${c.subtitle} ${c.extra}`);
  // AND semantics: every token must appear somewhere searchable.
  for (const token of tokens) {
    if (!haystack.includes(token)) return null;
  }
  let score = 0;
  if (title === query) score += 200;
  else if (title.startsWith(query)) score += 120;
  else if (title.includes(query)) score += 80;
  for (const token of tokens) {
    if (title.includes(token)) score += 20;
    else if (normalizeSearchText(c.subtitle).includes(token)) score += 6;
    else score += 2; // matched only in extra fields
  }
  // Shorter titles that still match are usually the intended target.
  score -= Math.min(20, Math.floor(title.length / 10));
  return score;
}

function buildCandidates(data: SearchData): Candidate[] {
  const out: Candidate[] = [];
  const assessmentById = new Map(data.assessments.map((a) => [a.id, a]));

  // Clients — one result per distinct client name (assessments + schedules).
  const clientNames = new Set<string>();
  for (const a of data.assessments) clientNames.add(a.clientName);
  for (const s of data.schedules) clientNames.add(s.clientName);
  for (const name of clientNames) {
    const own = data.assessments.filter((a) => a.clientName === name);
    const campuses = Array.from(
      new Set([
        ...own.map((a) => a.campus),
        ...data.schedules.filter((s) => s.clientName === name).map((s) => s.campus),
      ])
    );
    out.push({
      kind: "client",
      key: `client:${name}`,
      title: name,
      subtitle:
        own.length > 0
          ? `${own.length} assessment${own.length === 1 ? "" : "s"} · ${campuses.join(", ")}`
          : `Scheduled · ${campuses.join(", ")}`,
      href: `/clients?client=${encodeURIComponent(name)}`,
      extra: campuses.join(" "),
    });
  }

  // Assessments.
  for (const a of data.assessments) {
    const date = (a.completedAt ?? a.createdAt).slice(0, 10);
    out.push({
      kind: "assessment",
      key: `assessment:${a.id}`,
      title: a.clientName,
      subtitle: `${a.campus} · ${STATUS_LABELS[a.status]}${date ? ` · ${date}` : ""}`,
      href: `/assessments/${a.id}`,
      extra: a.focusNotes,
    });
  }

  // Findings — lands on /findings pre-filtered by the gap text, which
  // the findings page's own text filter matches against gap + client +
  // domain + note + owner, so the exact finding is the top row there.
  for (const f of data.findings) {
    const clientName = assessmentById.get(f.assessmentId)?.clientName ?? "";
    out.push({
      kind: "finding",
      key: `finding:${f.id}`,
      title: f.gapText,
      subtitle: `${clientName ? `${clientName} · ` : ""}${f.risk} risk`,
      href: `/findings?q=${encodeURIComponent(f.gapText)}`,
      extra: `${clientName} ${f.note} ${f.recommendation} ${f.caOwner ?? ""}`,
    });
  }

  // Reports — combined (group) reports included; their assessmentId is
  // a "group:…" key and the report page resolves them by doc id.
  for (const r of data.reports) {
    const clientName = assessmentById.get(r.assessmentId)?.clientName ?? "";
    out.push({
      kind: "report",
      key: `report:${r.id}`,
      title: r.title,
      subtitle: REPORT_KIND_LABELS[r.kind],
      href: `/reports/${r.id}`,
      extra: `${clientName} ${r.markdown.slice(0, 500)}`,
    });
  }

  return out;
}

/**
 * Search every kind at once. Returns best-first results, capped at
 * `limit` (default 12 — the header dropdown stays scannable). An empty
 * or whitespace-only query returns [].
 */
export function searchAll(
  data: SearchData,
  query: string,
  limit = 12
): SearchResult[] {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return [];
  const normalizedQuery = normalizeSearchText(query);
  const results: SearchResult[] = [];
  for (const candidate of buildCandidates(data)) {
    const score = scoreCandidate(candidate, normalizedQuery, tokens);
    if (score === null) continue;
    results.push({
      kind: candidate.kind,
      key: candidate.key,
      title: candidate.title,
      subtitle: candidate.subtitle,
      href: candidate.href,
      score,
    });
  }
  results.sort(
    (a, b) => b.score - a.score || a.title.localeCompare(b.title)
  );
  return results.slice(0, Math.max(0, limit));
}
