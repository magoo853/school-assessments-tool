/**
 * School Assessments Tool → Code Red Hub exchange export.
 *
 * Builds a versioned JSON package that the Code Red Hub can import
 * ("Assessments → Import from Assessments Tool"). The package carries
 * assessments, checkpoint responses, findings, equipment recommendations,
 * generated reports, schedules, and the template definitions needed to
 * interpret them — so an assessor who starts in this standalone tool can
 * move their work into the Hub later without re-entering anything.
 *
 * Exchange contract: docs/hub-exchange-format.md (v1).
 */

import {
  db,
  type Assessment,
  type AssessmentStatus,
} from "@/lib/store";
import { getTemplate, TEMPLATES } from "@/lib/templates";

export const HUB_EXCHANGE_FORMAT = "sat-hub-exchange";
export const HUB_EXCHANGE_VERSION = 1;

export interface ExchangeTemplate {
  key: string;
  name: string;
  stateCode: string;
  version: string;
  domains: { name: string; checkpoints: { key: string; num: string; text: string }[] }[];
}

export interface ExchangeResponse {
  domain: string;
  number: string;
  question: string;
  answer: "yes" | "no" | "na";
  risk: "low" | "moderate" | "high" | null;
  notes: string;
}

export interface ExchangeFinding {
  domain: string;
  severity: "low" | "medium" | "high";
  gapText: string;
  recommendation: string;
  note: string;
}

export interface ExchangeEquipment {
  name: string;
  detail: string;
  priority: "low" | "moderate" | "high";
  /** Checkpoint key of the linked finding, when known. */
  findingRef: string | null;
}

export interface ExchangeReport {
  kind: "aar" | "findings" | "recommendations";
  title: string;
  markdown: string;
  updatedAt: string;
}

export interface ExchangeAssessment {
  clientName: string;
  campus: string;
  templateKey: string;
  assessorNames: string[];
  status: AssessmentStatus;
  scheduledDate: string | null;
  completedDate: string | null;
  /** Percent of answered checkpoints passed (yes / (yes + no)), 1 decimal; null when nothing answered. */
  score: number | null;
  summary: string;
  responses: ExchangeResponse[];
  findings: ExchangeFinding[];
  equipment: ExchangeEquipment[];
  reports: ExchangeReport[];
}

export interface ExchangeSchedule {
  clientName: string;
  campus: string;
  date: string;
  templateKey: string;
  assessorName: string;
  focusNotes: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
}

export interface HubExchange {
  format: typeof HUB_EXCHANGE_FORMAT;
  version: number;
  exportedAt: string;
  exportedBy: string;
  templates: ExchangeTemplate[];
  assessments: ExchangeAssessment[];
  schedules: ExchangeSchedule[];
}

const TEMPLATE_STATE_CODES: Record<string, string> = {
  isc42: "ISC",
  "fl-fssat": "FL",
  la: "LA",
};

const TEMPLATE_VERSIONS: Record<string, string> = {
  isc42: "1",
  "fl-fssat": "1",
  la: "1",
};

function exportTemplate(id: string): ExchangeTemplate {
  const t = getTemplate(id);
  return {
    key: t.id,
    name: t.name,
    stateCode: TEMPLATE_STATE_CODES[t.id] ?? "GEN",
    version: TEMPLATE_VERSIONS[t.id] ?? "1",
    domains: t.domains.map((d) => ({
      name: d.name,
      checkpoints: d.checkpoints.map((c) => ({ key: c.key, num: c.num, text: c.text })),
    })),
  };
}

function assessorName(id: string | undefined, assessors: { id: string; name: string }[]): string {
  if (!id) return "";
  return assessors.find((a) => a.id === id)?.name ?? "";
}

function exportAssessment(a: Assessment): ExchangeAssessment {
  const template = getTemplate(a.templateId);
  const assessors = db.assessors.list();
  const responses = db.responses.filter((r) => r.assessmentId === a.id && r.answer !== null);

  let yes = 0;
  let answered = 0;
  const outResponses: ExchangeResponse[] = [];
  for (const r of responses) {
    const hit = template.domains
      .map((d) => ({ d, c: d.checkpoints.find((c) => c.key === r.checkpointKey) }))
      .find((x) => x.c);
    answered += 1;
    if (r.answer === "yes") yes += 1;
    outResponses.push({
      domain: hit?.d.name ?? "General",
      number: hit?.c?.num ?? r.checkpointKey,
      question: hit?.c?.text ?? r.checkpointKey,
      answer: r.answer as "yes" | "no" | "na",
      risk: r.risk,
      notes: [r.photoRef ? `[Photo ref: ${r.photoRef}]` : "", r.note].filter(Boolean).join(" "),
    });
  }

  const findings = db.findings
    .filter((f) => f.assessmentId === a.id)
    .map((f) => {
      const hit = template.domains
        .map((d) => ({ d, c: d.checkpoints.find((c) => c.key === f.checkpointKey) }))
        .find((x) => x.c);
      return {
        domain: hit?.d.name ?? "General",
        severity: (f.risk === "moderate" ? "medium" : f.risk) as "low" | "medium" | "high",
        gapText: f.gapText,
        recommendation: f.recommendation,
        note: f.note,
      } satisfies ExchangeFinding;
    });

  const equipment = db.equipment
    .filter((e) => e.assessmentId === a.id)
    .map((e) => ({
      name: e.name,
      detail: e.detail,
      priority: e.priority,
      findingRef: e.findingId
        ? (db.findings.get(e.findingId)?.checkpointKey ?? null)
        : null,
    }));

  const reports = db.reports
    .filter((r) => r.assessmentId === a.id)
    .map((r) => ({ kind: r.kind, title: r.title, markdown: r.markdown, updatedAt: r.updatedAt }));

  const lead = assessorName(a.leadAssessorId, assessors);
  const team = a.assessorIds.map((id) => assessorName(id, assessors)).filter(Boolean);
  const names = [...new Set([lead, ...team].filter(Boolean))];

  const summaryLines = [
    `Imported from the School Assessments Tool on ${new Date().toISOString().slice(0, 10)}.`,
    names.length ? `Assessors: ${names.join(", ")}.` : "",
    a.cover?.date ? `Walkthrough date: ${a.cover.date}.` : "",
    a.focusNotes ? `Focus: ${a.focusNotes}` : "",
  ].filter(Boolean);

  const scheduled = a.scheduledId ? db.schedules.get(a.scheduledId) : undefined;

  return {
    clientName: a.clientName,
    campus: a.campus,
    templateKey: a.templateId,
    assessorNames: names,
    status: a.status,
    scheduledDate: scheduled?.date ?? a.cover?.date ?? null,
    completedDate: a.completedAt ? a.completedAt.slice(0, 10) : null,
    score: answered > 0 ? Math.round((yes / answered) * 1000) / 10 : null,
    summary: summaryLines.join("\n"),
    responses: outResponses,
    findings,
    equipment,
    reports,
  };
}

/**
 * Build the full exchange package. `completedOnly` limits assessments to
 * completed walkthroughs; schedules always export in full.
 */
export function buildHubExchange(completedOnly: boolean): HubExchange {
  const assessments = db.assessments
    .list()
    .filter((a) => (completedOnly ? a.status === "completed" : true))
    .map(exportAssessment);

  const usedTemplateKeys = [...new Set(assessments.map((a) => a.templateKey))];
  const scheduledTemplateKeys = db.schedules.list().map((s) => s.templateId);
  const templateKeys = [...new Set([...usedTemplateKeys, ...scheduledTemplateKeys])];
  // Always include the default template so the Hub can interpret unanswered checklists.
  if (!templateKeys.includes(TEMPLATES[0].id)) templateKeys.push(TEMPLATES[0].id);

  const assessors = db.assessors.list();
  const schedules: ExchangeSchedule[] = db.schedules.list().map((s) => ({
    clientName: s.clientName,
    campus: s.campus,
    date: s.date,
    templateKey: s.templateId,
    assessorName: assessorName(s.assessorId, assessors),
    focusNotes: s.focusNotes,
    status: s.status,
  }));

  return {
    format: HUB_EXCHANGE_FORMAT,
    version: HUB_EXCHANGE_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: "School Assessments Tool",
    templates: templateKeys.map(exportTemplate),
    assessments,
    schedules,
  };
}

/** Suggested download filename for an exchange package. */
export function exchangeFilename(): string {
  return `sat-hub-export-${new Date().toISOString().slice(0, 10)}.json`;
}
