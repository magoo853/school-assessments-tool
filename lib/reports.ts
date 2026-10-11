/**
 * School Assessments Tool — Reports & Exports (slice 2).
 *
 * Markdown builders for the AAR, Findings report, and Recommendations
 * report; template-composed ("AI-assisted") draft paragraphs that pre-fill
 * the editable report docs; CSV row builders; Blob-based download helpers.
 *
 * Hard rules enforced here:
 * - Failed checkpoints are worded as NEGATIVE gap statements everywhere
 *   (Finding.gapText). Criterion text is never used as a finding statement.
 * - Reports never invent data: only responses / findings / notes / equipment
 *   supplied to the builders are used.
 *
 * ────────────────────
 */

import {
  db,
  nowIso,
  uid,
  type Assessment,
  type EquipmentItem,
  type Finding,
  type ReportDoc,
  type ReportKind,
  type ResponseRow,
} from "@/lib/store";

import type { AssessmentTemplate } from "@/lib/templates";

export interface ReportCounts {
  total: number;
  yes: number;
  no: number;
  na: number;
  unanswered: number;
  findings: number;
  high: number;
  moderate: number;
  low: number;
}

export function countReportData(
  responses: ResponseRow[],
  findings: Finding[]
): ReportCounts {
  const c: ReportCounts = {
    total: 0,
    yes: 0,
    no: 0,
    na: 0,
    unanswered: 0,
    findings: findings.length,
    high: 0,
    moderate: 0,
    low: 0,
  };
  for (const r of responses) {
    c.total += 1;
    if (r.answer === "yes") c.yes += 1;
    else if (r.answer === "no") c.no += 1;
    else if (r.answer === "na") c.na += 1;
    else c.unanswered += 1;
  }
  for (const f of findings) {
    if (f.risk === "high") c.high += 1;
    else if (f.risk === "moderate") c.moderate += 1;
    else c.low += 1;
  }
  return c;
}

interface CheckpointRef {
  num: string;
  text: string;
  domain: string;
}

/** Index checkpoints by key for human-readable references. */
export function buildCheckpointIndex(
  template?: AssessmentTemplate | null
): Map<string, CheckpointRef> {
  const idx = new Map<string, CheckpointRef>();
  if (!template) return idx;
  for (const d of template.domains) {
    for (const cp of d.checkpoints) {
      idx.set(cp.key, { num: cp.num, text: cp.text, domain: d.name });
    }
  }
  return idx;
}

/** Short reference label, e.g. "3.2 — Perimeter" or the raw key as fallback. */
function checkpointLabel(key: string, idx: Map<string, CheckpointRef>): string {
  const c = idx.get(key);
  return c ? `${c.num} — ${c.domain}` : key;
}

function orDash(v: string | undefined | null): string {
  const t = (v ?? "").trim();
  return t ? t : "—";
}

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "report"
  );
}

function assessorNames(a: Assessment): string {
  const fromDb = db.assessors
    .filter((x) => a.assessorIds.includes(x.id))
    .map((x) => x.name);
  const names = [...fromDb];
  const cover = (a.cover?.assessors ?? "").trim();
  if (cover && !names.includes(cover)) names.push(cover);
  return names.length ? names.join(", ") : "Not recorded";
}

function reportDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function assessmentDate(a: Assessment): string {
  return (a.cover?.date ?? "").trim() || a.createdAt.slice(0, 10);
}

function riskLabel(r: string): string {
  return r.charAt(0).toUpperCase() + r.slice(1);
}

function sortFindings(findings: Finding[]): Finding[] {
  const rank = { high: 0, moderate: 1, low: 2 } as Record<string, number>;
  return [...findings].sort(
    (x, y) => (rank[x.risk] ?? 3) - (rank[y.risk] ?? 3)
  );
}

/* ──────────────────────────────
 * "AI-assisted" draft paragraphs.
 * Template-composed from the answer data — these pre-fill the editable
 * report docs and the user edits every word.
 * ────────────────────────────── */

export function draftExecutiveSummary(
  a: Assessment,
  responses: ResponseRow[],
  findings: Finding[],
  template?: AssessmentTemplate | null
): string {
  const c = countReportData(responses, findings);
  const date = assessmentDate(a);
  const names = assessorNames(a);
  const templateName = template?.name ?? "school safety assessment";
  const highDomains = [
    ...new Set(
      findings
        .filter((f) => f.risk === "high")
        .map((f) => {
          const d = buildCheckpointIndex(template).get(f.checkpointKey);
          return d ? d.domain : null;
        })
        .filter((d): d is string => !!d)
    ),
  ];
  const domainClause = highDomains.length
    ? ` High-priority gaps concentrate in ${highDomains.join(", ")}.`
    : "";
  return (
    `On ${date}, ${names} conducted a ${templateName} walkthrough at ${a.clientName} (${a.campus}).` +
    ` Of ${c.total} checkpoints answered, ${c.yes} met the standard and ${c.no} did not, yielding ${c.findings} documented findings (${c.high} high-risk, ${c.moderate} moderate-risk, ${c.low} low-risk).` +
    domainClause +
    ` The recommendations and Prioritized Corrective Action Plan in this report address each finding in risk order.`
  );
}

export function draftStrengths(
  responses: ResponseRow[],
  template?: AssessmentTemplate | null
): string {
  const idx = buildCheckpointIndex(template);
  const yes = responses
    .filter((r) => r.answer === "yes")
    .map((r) => idx.get(r.checkpointKey)?.text)
    .filter((t): t is string => !!t && t.trim().length > 0);
  if (!yes.length) {
    return "No checkpoints were recorded as fully meeting the standard during this walkthrough.";
  }
  const top = yes.slice(0, 6);
  const list = top.map((t) => t.replace(/\.$/, "")).join("; ");
  const more = yes.length > top.length ? `, among ${yes.length} areas meeting the standard overall` : "";
  return `Strengths observed during the walkthrough include: ${list}${more}. These represent practices the school should sustain as it addresses the gaps documented below.`;
}

export function draftConclusion(
  a: Assessment,
  responses: ResponseRow[],
  findings: Finding[]
): string {
  const c = countReportData(responses, findings);
  return (
    `This report documents ${c.findings} findings identified at ${a.clientName} (${a.campus}) on ${assessmentDate(a)}.` +
    ` Addressing the ${c.high} high-risk item${c.high === 1 ? "" : "s"} first will materially reduce the campus's exposure.` +
    ` The attached Corrective Action Plan sequences remediation by priority; the assessment team recommends reviewing progress before the next scheduled reassessment.`
  );
}

/* ──────────────────────────────
 * Report markdown builders
 * ────────────────────────────── */

export function buildAarMarkdown(
  a: Assessment,
  responses: ResponseRow[],
  findings: Finding[],
  equipment: EquipmentItem[],
  template?: AssessmentTemplate | null
): string {
  const idx = buildCheckpointIndex(template);
  const sorted = sortFindings(findings);
  const critical = sorted.filter((f) => f.risk === "high");
  const others = sorted.filter((f) => f.risk !== "high");
  const yesCount = responses.filter((r) => r.answer === "yes").length;
  const c = countReportData(responses, findings);
  const yesAnswers = responses.filter((r) => r.answer === "yes");
  const strengthsTop = yesAnswers.slice(0, 8);
  const linkedEquipment = (f: Finding) =>
    equipment.filter((e) => e.findingId === f.id);
  const unlinkedEquipment = equipment.filter(
    (e) => !e.findingId || !findings.some((f) => f.id === e.findingId)
  );

  const L: string[] = [];
  L.push(`# After-Action Report: ${a.clientName}`);
  L.push("");
  L.push(`**Client:** ${a.clientName}`);
  L.push(`**Campus:** ${a.campus}`);
  L.push(`**Assessment date:** ${assessmentDate(a)}`);
  L.push(`**Assessor(s):** ${assessorNames(a)}`);
  L.push(`**Prepared for:** ${a.clientName}`);
  L.push(`**Report date:** ${reportDate()}`);
  L.push("");
  L.push("---");
  L.push("");
  L.push("## Table of Contents");
  L.push("");
  L.push("1. [Purpose of the Report](#purpose-of-the-report)");
  L.push("2. [Executive Summary](#executive-summary)");
  L.push("3. [Key Strengths](#key-strengths)");
  L.push("4. [Critical Vulnerabilities](#critical-vulnerabilities)");
  L.push("5. [Priority Recommendations](#priority-recommendations)");
  L.push("6. [Additional Findings and Observations](#additional-findings-and-observations)");
  L.push("7. [Conclusion](#conclusion)");
  L.push("8. [Executive Certification](#executive-certification)");
  L.push("9. [Appendix — Prioritized Corrective Action Plan](#appendix--prioritized-corrective-action-plan)");
  L.push("");

  L.push("## Purpose of the Report");
  L.push("");
  L.push(
    `This After-Action Report documents the school safety assessment conducted at ${a.clientName} (${a.campus}) on ${assessmentDate(a)}.`
  );
  L.push(
    `The assessor(s) performed a checkpoint-by-checkpoint walkthrough${template ? ` using the ${template.name} template` : ""}, recording for each checkpoint whether the standard was met, the assessed risk of any gap, and supporting notes.`
  );
  L.push(
    "Every gap in this report is worded as a negative gap statement — what was observed to be missing or deficient — so findings can be assigned and verified as corrected. Nothing in this report is inferred beyond what was recorded during the walkthrough."
  );
  L.push("");

  L.push("## Executive Summary");
  L.push("");
  L.push(draftExecutiveSummary(a, responses, findings, template));
  L.push("");
  L.push(
    `- Checkpoints answered: ${c.total} (${yesCount} met the standard, ${c.no} did not, ${c.na} not applicable, ${c.unanswered} unanswered)`
  );
  L.push(
    `- Findings: ${c.findings} total — ${c.high} high-risk, ${c.moderate} moderate-risk, ${c.low} low-risk`
  );
  L.push("");

  L.push("## Key Strengths");
  L.push("");
  if (!strengthsTop.length) {
    L.push("No checkpoints were recorded as fully meeting the standard during this walkthrough.");
  } else {
    strengthsTop.forEach((r, i) => {
      const cp = idx.get(r.checkpointKey);
      const label = cp ? `${cp.num} — ${cp.text}` : r.checkpointKey;
      L.push(`${i + 1}. **${label}**`);
      if (r.note.trim()) L.push(`   - Assessor note: ${r.note.trim()}`);
    });
  }
  L.push("");

  L.push("## Critical Vulnerabilities");
  L.push("");
  if (!critical.length) {
    L.push("No high-risk findings were documented during this walkthrough.");
  } else {
    critical.forEach((f, i) => {
      const cp = idx.get(f.checkpointKey);
      L.push(`### ${i + 1}. ${f.gapText}`);
      L.push("");
      L.push(`- **Risk:** ${riskLabel(f.risk)}`);
      L.push(`- **Checkpoint:** ${checkpointLabel(f.checkpointKey, idx)}`);
      if (cp?.text) L.push(`- **Criterion:** "${cp.text}"`);
      if (f.note.trim()) L.push(`- **Assessor note:** ${f.note.trim()}`);
      if (f.recommendation.trim()) L.push(`- **Recommendation:** ${f.recommendation.trim()}`);
      L.push("");
    });
  }

  L.push("## Priority Recommendations");
  L.push("");
  if (!sorted.length) {
    L.push("No findings were documented, so no recommendations are required.");
  } else {
    sorted.forEach((f, i) => {
      L.push(
        `${i + 1}. **${riskLabel(f.risk)} priority** — ${f.gapText}`
      );
      if (f.recommendation.trim()) L.push(`   - Recommendation: ${f.recommendation.trim()}`);
      L.push(`   - Checkpoint: ${checkpointLabel(f.checkpointKey, idx)}`);
    });
  }
  L.push("");

  L.push("## Additional Findings and Observations");
  L.push("");
  if (!others.length) {
    L.push(
      critical.length
        ? "All documented findings are high-risk and listed under Critical Vulnerabilities above."
        : "No findings were documented during this walkthrough."
    );
  } else {
    others.forEach((f) => {
      L.push(`### ${f.gapText}`);
      L.push("");
      L.push(`- **Risk:** ${riskLabel(f.risk)}`);
      L.push(`- **Checkpoint:** ${checkpointLabel(f.checkpointKey, idx)}`);
      if (f.note.trim()) L.push(`- **Assessor note:** ${f.note.trim()}`);
      if (f.recommendation.trim()) L.push(`- **Recommendation:** ${f.recommendation.trim()}`);
      L.push("");
    });
  }

  L.push("## Conclusion");
  L.push("");
  L.push(draftConclusion(a, responses, findings));
  L.push("");

  L.push("## Executive Certification");
  L.push("");
  L.push(
    "The undersigned certify that this report accurately reflects the observations recorded during the assessment described above."
  );
  L.push("");
  L.push("| Role | Signature | Date |");
  L.push("| ---- | --------- | ---- |");
  L.push("| Lead Assessor | ________________________ | __________ |");
  L.push("| Client Representative | ________________________ | __________ |");
  L.push("");

  L.push("## Appendix — Prioritized Corrective Action Plan");
  L.push("");
  if (!sorted.length) {
    L.push("No corrective actions required.");
  } else {
    sorted.forEach((f, i) => {
      const eq = linkedEquipment(f);
      L.push(`### ${i + 1}. [${riskLabel(f.risk)}] ${f.gapText}`);
      L.push("");
      L.push(`- **Checkpoint:** ${checkpointLabel(f.checkpointKey, idx)}`);
      L.push(`- **Recommendation:** ${orDash(f.recommendation)}`);
      if (eq.length) {
        L.push(`- **Equipment:**`);
        eq.forEach((e) =>
          L.push(
            `  - ${e.name}${e.detail.trim() ? ` — ${e.detail.trim()}` : ""} (priority: ${e.priority})`
          )
        );
      }
      if (f.note.trim()) L.push(`- **Assessor note:** ${f.note.trim()}`);
      L.push("");
    });
    if (unlinkedEquipment.length) {
      L.push("### Unlinked equipment (not tied to a specific finding)");
      L.push("");
      unlinkedEquipment.forEach((e) =>
        L.push(
          `- ${e.name}${e.detail.trim() ? ` — ${e.detail.trim()}` : ""} (priority: ${e.priority})`
        )
      );
      L.push("");
    }
  }

  return L.join("\n");
}

export function buildFindingsMarkdown(
  a: Assessment,
  findings: Finding[],
  template?: AssessmentTemplate | null
): string {
  const idx = buildCheckpointIndex(template);
  const sorted = sortFindings(findings);
  const c = countReportData([], findings);

  const L: string[] = [];
  L.push(`# Findings Report: ${a.clientName}`);
  L.push("");
  L.push(`**Client:** ${a.clientName}`);
  L.push(`**Campus:** ${a.campus}`);
  L.push(`**Assessment date:** ${assessmentDate(a)}`);
  L.push(`**Assessor(s):** ${assessorNames(a)}`);
  L.push(`**Report date:** ${reportDate()}`);
  L.push("");
  L.push(
    `This report documents ${c.findings} finding${c.findings === 1 ? "" : "s"} (${c.high} high-risk, ${c.moderate} moderate-risk, ${c.low} low-risk), each worded as a negative gap statement describing what was observed to be missing or deficient.`
  );
  L.push("");

  if (!sorted.length) {
    L.push("No findings were documented during this walkthrough.");
    return L.join("\n");
  }

  sorted.forEach((f, i) => {
    const cp = idx.get(f.checkpointKey);
    L.push(`## ${i + 1}. ${f.gapText}`);
    L.push("");
    L.push(`- **Risk:** ${riskLabel(f.risk)}`);
    L.push(`- **Checkpoint:** ${checkpointLabel(f.checkpointKey, idx)}`);
    if (cp?.text) L.push(`- **Criterion:** "${cp.text}"`);
    L.push(`- **Assessor note:** ${orDash(f.note)}`);
    L.push(`- **Recommendation:** ${orDash(f.recommendation)}`);
    L.push("");
  });

  return L.join("\n");
}

export function buildRecommendationsMarkdown(
  a: Assessment,
  findings: Finding[],
  equipment: EquipmentItem[],
  template?: AssessmentTemplate | null
): string {
  const idx = buildCheckpointIndex(template);
  const sorted = sortFindings(findings);
  const groups: { label: string; items: EquipmentItem[] }[] = [
    { label: "High priority", items: [] },
    { label: "Moderate priority", items: [] },
    { label: "Low priority", items: [] },
  ];
  for (const e of equipment) {
    const g =
      e.priority === "high"
        ? groups[0]
        : e.priority === "moderate"
          ? groups[1]
          : groups[2];
    g.items.push(e);
  }
  const linkedGap = (e: EquipmentItem) =>
    findings.find((f) => f.id === e.findingId)?.gapText;

  const L: string[] = [];
  L.push(`# Recommendations Report: ${a.clientName}`);
  L.push("");
  L.push(`**Client:** ${a.clientName}`);
  L.push(`**Campus:** ${a.campus}`);
  L.push(`**Assessment date:** ${assessmentDate(a)}`);
  L.push(`**Assessor(s):** ${assessorNames(a)}`);
  L.push(`**Report date:** ${reportDate()}`);
  L.push("");
  L.push("## Priority Recommendations");
  L.push("");
  if (!sorted.length) {
    L.push("No findings were documented, so no recommendations are required.");
  } else {
    sorted.forEach((f, i) => {
      L.push(`### ${i + 1}. [${riskLabel(f.risk)}] ${f.gapText}`);
      L.push("");
      L.push(`- **Recommendation:** ${orDash(f.recommendation)}`);
      L.push(`- **Checkpoint:** ${checkpointLabel(f.checkpointKey, idx)}`);
      L.push("");
    });
  }
  L.push("## Equipment");
  L.push("");
  if (!equipment.length) {
    L.push("No equipment needs were recorded for this assessment.");
  } else {
    for (const g of groups) {
      if (!g.items.length) continue;
      L.push(`### ${g.label}`);
      L.push("");
      for (const e of g.items) {
        L.push(`- **${e.name}**${e.detail.trim() ? ` — ${e.detail.trim()}` : ""}`);
        const gap = linkedGap(e);
        if (gap) L.push(`  - Linked finding: ${gap}`);
      }
      L.push("");
    }
  }

  return L.join("\n");
}

/* ──────────────────────────────
 * CSV builders + download helpers
 * ────────────────────────────── */

export function toCsv(
  rows: (string | number | boolean | null | undefined)[][]
): string {
  const esc = (v: string | number | boolean | null | undefined): string => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

/** Browser-only Blob download. Safe no-op during SSR. */
export function download(
  filename: string,
  text: string,
  mime = "text/plain;charset=utf-8"
): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const el = document.createElement("a");
  el.href = url;
  el.download = filename;
  document.body.appendChild(el);
  el.click();
  el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function findingsCsv(
  findings: Finding[],
  template?: AssessmentTemplate | null
): string {
  const idx = buildCheckpointIndex(template);
  return toCsv([
    ["id", "assessment_id", "checkpoint_key", "checkpoint_ref", "risk", "gap_statement", "assessor_note", "recommendation"],
    ...sortFindings(findings).map((f) => [
      f.id,
      f.assessmentId,
      f.checkpointKey,
      checkpointLabel(f.checkpointKey, idx),
      f.risk,
      f.gapText,
      f.note,
      f.recommendation,
    ]),
  ]);
}

export function responsesCsv(responses: ResponseRow[]): string {
  return toCsv([
    ["id", "assessment_id", "checkpoint_key", "answer", "risk", "note"],
    ...responses.map((r) => [
      r.id,
      r.assessmentId,
      r.checkpointKey,
      r.answer ?? "",
      r.risk ?? "",
      r.note,
    ]),
  ]);
}

export function equipmentCsv(equipment: EquipmentItem[]): string {
  return toCsv([
    ["id", "assessment_id", "finding_id", "name", "detail", "priority"],
    ...equipment.map((e) => [
      e.id,
      e.assessmentId,
      e.findingId ?? "",
      e.name,
      e.detail,
      e.priority,
    ]),
  ]);
}

export function assessmentsCsv(assessments: Assessment[]): string {
  return toCsv([
    ["id", "client_name", "campus", "template_id", "status", "assessment_date", "created_at", "completed_at", "focus_notes"],
    ...assessments.map((a) => [
      a.id,
      a.clientName,
      a.campus,
      a.templateId,
      a.status,
      assessmentDate(a),
      a.createdAt,
      a.completedAt ?? "",
      a.focusNotes,
    ]),
  ]);
}

/* ──────────────────────────────
 * Report doc persistence helper
 * ────────────────────────────── */

export const REPORT_LABELS: Record<ReportKind, string> = {
  aar: "After-Action Report",
  findings: "Findings Report",
  recommendations: "Recommendations Report",
};

export function upsertReport(
  assessmentId: ID2,
  kind: ReportKind,
  markdown: string,
  title?: string
): ReportDoc {
  const existing = db.reports.filter(
    (r) => r.assessmentId === assessmentId && r.kind === kind
  )[0];
  const doc: ReportDoc = existing
    ? { ...existing, markdown, updatedAt: nowIso() }
    : {
        id: uid("rpt"),
        assessmentId,
        kind,
        title: title ?? `${REPORT_LABELS[kind]}`,
        markdown,
        updatedAt: nowIso(),
      };
  return db.reports.upsert(doc);
}

// Local alias for the ID type without importing from store twice.
type ID2 = string;
