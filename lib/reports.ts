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
  type FslRecord,
  type ReportDoc,
  type ReportKind,
  type ResponseRow,
} from "@/lib/store";
import { fslLabel, populationPoints, sizePoints } from "@/lib/fsl";

import type { AssessmentTemplate } from "@/lib/templates";
import { photosFor, listPhotos } from "./photos";
import {
  splitByTiming,
  buildPhotoLog,
  fmtPhotoStamp,
  postBadgeLabel,
} from "./photoEvidence";
import { getBranding } from "./branding";
import { renderMarkdownHtml } from "@/components/MarkdownView";

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
  const ids = new Set(a.assessorIds);
  if (a.leadAssessorId) ids.add(a.leadAssessorId);
  const names = db.assessors
    .filter((x) => ids.has(x.id))
    .map((x) => x.name);
  const cover = (a.cover?.assessors ?? "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const n of cover) if (!names.includes(n)) names.push(n);
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
  template?: AssessmentTemplate | null,
  fsl?: FslRecord | null
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
  const stamp = reviewStampMd(a);
  if (stamp) L.push(stamp);
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
  if (fsl) {
    const adjNote =
      fsl.intangibleAdj !== 0
        ? `, adjusted ${fsl.intangibleAdj > 0 ? "+1" : "−1"} level with documented justification`
        : "";
    L.push(
      `- Facility Security Level: **${fslLabel(fsl.final, fsl.federalFacility)}** — ${fsl.total} points across the five ISC factors (preliminary ${fslLabel(fsl.preliminary, fsl.federalFacility)}${adjNote})`
    );
    L.push(
      `- FSL basis: mission ${fsl.mission}, symbolism ${fsl.symbolism}, population ${fsl.populationCount != null ? populationPoints(fsl.populationCount) : "—"}, size ${fsl.sizeSqft != null ? sizePoints(fsl.sizeSqft) : "—"}, threat ${fsl.threat}`
    );
  } else {
    L.push(
      `- Facility Security Level: not determined — complete Step 1 (FSL determination) on the assessment to establish the baseline Level of Protection`
    );
  }
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

/**
 * Approval stamp for generated report documents. The shared/print
 * HTML has carried the stamp since the review workflow shipped, but
 * the markdown documents themselves did not — so a client receiving
 * the report file saw no approval (2026-10-29 production audit).
 */
export function reviewStampMd(a: Assessment): string | null {
  const r = a.review;
  if (!r) return null;
  if (r.state === "approved")
    return `**Review:** \u2713 Reviewed & approved by ${r.decidedBy ?? "reviewer"} \u00b7 ${(r.decidedAt ?? "").slice(0, 10)}`;
  if (r.state === "pending")
    return `**Review:** \u23f3 In review \u2014 submitted by ${r.submittedBy} \u00b7 ${(r.submittedAt ?? "").slice(0, 10)}`;
  return null;
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
  const stamp = reviewStampMd(a);
  if (stamp) L.push(stamp);
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
  const stamp = reviewStampMd(a);
  if (stamp) L.push(stamp);
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
 * Self-contained shareable HTML report.
 *
 * buildShareHtml() produces ONE .html file with inline CSS, the rendered
 * report body, and photo evidence embedded as data URLs. A school can open
 * it in any browser with no app and no account — the assessor emails the
 * file. True expiring share *links* arrive with shared (Supabase) data;
 * until then this file is the honest sharing path.
 * ────────────────────────────── */

function escAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface ShareHtmlInput {
  report: ReportDoc;
  assessment: Assessment;
  findings: Finding[];
  responses: ResponseRow[];
  equipment: EquipmentItem[];
  template?: AssessmentTemplate | null;
}

export function buildShareHtml(input: ShareHtmlInput): string {
  const { report, assessment: a, findings, equipment, template } = input;

  const title = escAttr(report.title || REPORT_LABELS[report.kind]);
  const date = assessmentDate(a);
  const names = escAttr(assessorNames(a));
  const client = escAttr(a.clientName);
  const campus = escAttr(a.campus);
  const templateName = escAttr(template?.name ?? "School safety assessment");
  const reportDateStr = escAttr(report.updatedAt.slice(0, 10));
  const branding = getBranding();
  const company = branding?.companyName.trim()
    ? escAttr(branding.companyName.trim())
    : "";
  // Only genuine image data URLs may reach an <img src> — branding and
  // photo data arrive via backups, so validate the scheme instead of
  // interpolating whatever string a crafted backup carried.
  const safeImg = (u: string | undefined): string =>
    typeof u === "string" && /^data:image\//i.test(u) ? u : "";
  const logo = safeImg(branding?.logoDataUrl);
  const brandRow =
    company || logo
      ? `<div class="brand">${logo ? `<img src="${logo}" alt=""/>` : ""}${company ? `<span>${company}</span>` : ""}</div>`
      : "";
  const body = renderMarkdownHtml(report.markdown);

  // Photo evidence per the approved standard (2026-10-14): photos sit
  // AT their finding (finding → photos → recommendation), the first
  // two at readable size and the rest as thumbnails; post-assessment
  // photos are badged and pair as before/after; a closing Photo Log
  // then lists every photo on the assessment.
  const sortedFindings = sortFindings(findings);
  const badgeHtml = (createdAt: string) =>
    `<span class="badge">📷 ${escAttr(postBadgeLabel({ createdAt }))}</span>`;
  const figHtml = (
    f: Finding,
    p: { dataUrl: string; caption: string; createdAt: string },
    post: boolean,
    large: boolean
  ): string => {
    const src = safeImg(p.dataUrl);
    if (!src) return "";
    return `<figure class="${large ? "lg" : "sm"}"><img src="${src}" alt="${escAttr(f.gapText)}"/>${post ? badgeHtml(p.createdAt) : ""}${p.caption?.trim() ? `<figcaption>${escAttr(p.caption.trim())}</figcaption>` : ""}</figure>`;
  };
  const eraGroup = (
    f: Finding,
    label: string,
    photos: ReturnType<typeof photosFor>,
    post: boolean
  ): string => {
    if (!photos.length) return "";
    const figs = photos
      .map((p, i) => figHtml(f, p, post, i < 2))
      .filter(Boolean)
      .join("\n");
    if (!figs) return "";
    return `<div class="era"><p class="era-label${post ? " post" : ""}">${label}</p><div class="grid">${figs}</div></div>`;
  };
  const evidenceSections = sortedFindings
    .map((f, i) => {
      const photos = photosFor(f.photoIds);
      if (!photos.length) return "";
      const { during, post } = splitByTiming(a, photos);
      const groups =
        during.length && post.length
          ? `<div class="pair">${eraGroup(f, "Before · during assessment", during, false)}${eraGroup(f, "After · post-assessment", post, true)}</div>`
          : eraGroup(
              f,
              post.length ? "Post-assessment evidence" : "Photo evidence",
              post.length ? post : during,
              post.length > 0
            );
      if (!groups) return "";
      return `<section class="finding-photos"><h3>${i + 1}. ${escAttr(f.gapText)} <span class="risk">${escAttr(riskLabel(f.risk))} risk</span></h3>${groups}${f.recommendation?.trim() ? `<p class="rec"><strong>Recommendation:</strong> ${escAttr(f.recommendation.trim())}</p>` : ""}</section>`;
    })
    .join("\n");

  const logEntries = buildPhotoLog({
    assessment: a,
    findings: sortedFindings,
    responses: input.responses ?? [],
    photosById: new Map(listPhotos().map((p) => [p.id, p])),
    checkpointIdx: buildCheckpointIndex(template),
  });
  const logRows = logEntries
    .map((e, i) => {
      const src = safeImg(e.photo.dataUrl);
      if (!src) return "";
      return `<tr><td><img src="${src}" alt=""/></td><td><strong>Photo ${i + 1}</strong><br/>${escAttr(fmtPhotoStamp(e.photo.createdAt))}${e.post ? `<br/>${badgeHtml(e.photo.createdAt)}` : ""}</td><td>${escAttr(e.location)}${e.criterion ? `<br/><span class="dim">“${escAttr(e.criterion)}”</span>` : ""}</td><td>${e.findingIndex ? `Finding ${e.findingIndex}: ${escAttr(e.findingGap ?? "")}` : "Not tied to a finding"}${e.photo.caption?.trim() ? `<br/><span class="dim">Caption: ${escAttr(e.photo.caption.trim())}</span>` : ""}</td></tr>`;
    })
    .filter(Boolean)
    .join("\n");
  const photoLogHtml = logRows
    ? `<section class="photolog"><h2>Photo log</h2><p class="dim">Complete record of photo evidence for this assessment, in the order captured.</p><table><thead><tr><th></th><th>Captured</th><th>Location</th><th>Reference</th></tr></thead><tbody>${logRows}</tbody></table></section>`
    : "";

  const equipRows = equipment.length
    ? `<section><h2>Equipment recommendations</h2><table><thead><tr><th>Item</th><th>Detail</th><th>Priority</th></tr></thead><tbody>${equipment
        .map(
          (e) =>
            `<tr><td>${escAttr(e.name)}</td><td>${escAttr(e.detail)}</td><td>${riskLabel(e.priority)}</td></tr>`
        )
        .join("")}</tbody></table></section>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title} — ${client}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 24px 16px; line-height: 1.6; }
  .doc { max-width: 860px; margin: 0 auto; background: #fff; border-radius: 16px; box-shadow: 0 12px 40px -16px rgba(109,40,217,.25); overflow: hidden; }
  .banner { background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff; padding: 32px; }
  .banner h1 { margin: 0 0 4px; font-size: 26px; letter-spacing: -0.02em; }
  .banner p { margin: 2px 0; font-size: 14px; opacity: .92; }
  .banner .prepared { margin-top: 12px; font-size: 13px; opacity: .85; }
  .banner .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; font-size: 19px; font-weight: 700; }
  .banner .brand img { height: 44px; max-width: 180px; object-fit: contain; background: #fff; border-radius: 8px; padding: 4px; }
  .content { padding: 32px; }
  .content h1 { font-size: 24px; margin: 8px 0 12px; letter-spacing: -0.02em; }
  .content h2 { font-size: 19px; margin: 28px 0 8px; padding-bottom: 6px; border-bottom: 2px solid #ede9fe; }
  .content h3 { font-size: 16px; margin: 20px 0 6px; }
  .content h4 { font-size: 14px; margin: 16px 0 4px; }
  .content p, .content li { font-size: 15px; }
  .content ul, .content ol { padding-left: 24px; }
  .content li { margin: 6px 0; }
  .content table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 14px; }
  .content th, .content td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; vertical-align: top; }
  .content th { background: #f8fafc; }
  .content hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
  .photos .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin: 12px 0 24px; }
  .photos figure { margin: 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
  .photos img { width: 100%; height: 180px; object-fit: cover; display: block; }
  .photos figcaption { font-size: 12px; color: #64748b; padding: 8px 10px; }
  .finding-photos { margin: 0 0 24px; }
  .finding-photos .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 8px 0 4px; }
  .finding-photos figure { position: relative; margin: 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
  .finding-photos figure img { width: 100%; object-fit: cover; display: block; }
  .finding-photos figure.lg img { height: 260px; }
  .finding-photos figure.sm img { height: 110px; }
  .finding-photos figcaption { font-size: 12px; color: #64748b; padding: 8px 10px; }
  .finding-photos .risk { font-size: 12px; color: #7c3aed; font-weight: 600; white-space: nowrap; }
  .finding-photos .rec { font-size: 14px; color: #475569; margin-top: 8px; }
  .era-label { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #64748b; margin: 10px 0 2px; }
  .era-label.post { color: #b45309; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 640px) { .pair { grid-template-columns: 1fr; } .finding-photos .grid { grid-template-columns: 1fr 1fr; } }
  .badge { display: inline-block; background: #fef3c7; color: #92400e; border: 1px solid #f59e0b; border-radius: 999px; padding: 1px 8px; font-size: 11px; font-weight: 600; }
  figure .badge { position: absolute; top: 8px; left: 8px; }
  .photolog table img { width: 56px; height: 56px; object-fit: cover; border-radius: 8px; display: block; }
  .photolog .dim, .dim { color: #64748b; font-size: 12px; }
  .footer { padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
  @media print { body { background: #fff; padding: 0; } .doc { box-shadow: none; border-radius: 0; } .banner { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="doc">
  <div class="banner">
    ${brandRow}
    <h1>${title}</h1>
    <p><strong>${client}</strong> — ${campus}</p>
    <p>Assessment date: ${date} · Report date: ${reportDateStr}</p>
    <p>Template: ${templateName}</p>
    <p class="prepared">Prepared by ${company ? `${company} · ` : ""}${names}${a.review?.state === "approved" ? ` · ✓ Reviewed &amp; approved by ${escAttr(a.review.decidedBy ?? "reviewer")} · ${escAttr((a.review.decidedAt ?? "").slice(0, 10))}` : ""}</p>
  </div>
  <div class="content">
    ${body}
    ${evidenceSections ? `<h2>Photo evidence</h2>\n${evidenceSections}` : ""}
    ${equipRows}
    ${photoLogHtml}
  </div>
  <div class="footer">Shared as a self-contained file — opens in any browser, no account needed.${company ? "" : " Generated by the School Assessments Tool."}</div>
</div>
</body>
</html>`;
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

/** Stable key for a group (combined) report: sorted assessment ids. */
export function groupReportKey(ids: string[]): string {
  return `group:${[...ids].sort().join("|")}`;
}

/**
 * Combined report across several assessments (district roll-up).
 * Findings and Recommendations only — an AAR is per-facility by design.
 * Each school's own report body is nested under its heading with its
 * headings demoted one level; per-school H1 titles are dropped.
 */
export function buildCombinedMarkdown(
  kind: ReportKind,
  parts: { assessment: Assessment; markdown: string; findings: Finding[] }[]
): string {
  const totals = { findings: 0, high: 0, moderate: 0, low: 0 };
  for (const p of parts) {
    totals.findings += p.findings.length;
    for (const f of p.findings) {
      if (f.risk === "high") totals.high += 1;
      else if (f.risk === "moderate") totals.moderate += 1;
      else totals.low += 1;
    }
  }

  const L: string[] = [];
  L.push(`# Combined ${REPORT_LABELS[kind]} — ${parts.length} schools`);
  L.push("");
  L.push(`**Report date:** ${reportDate()}`);
  L.push(
    `**Schools:** ${parts.map((p) => `${p.assessment.clientName} (${p.assessment.campus})`).join("; ")}`
  );
  L.push(
    `**Total findings:** ${totals.findings} (${totals.high} high-risk, ${totals.moderate} moderate-risk, ${totals.low} low-risk)`
  );
  L.push("");
  L.push(
    "This combined report rolls up the individual school reports below. Each section is that school's own report, unchanged."
  );
  L.push("");

  for (const p of parts) {
    L.push(`## ${p.assessment.clientName} — ${p.assessment.campus}`);
    L.push("");
    const body = p.markdown
      .split("\n")
      .filter((line, i) => !(i === 0 && line.startsWith("# ")))
      .map((line) => (/^#{1,5} /.test(line) ? `#${line}` : line))
      .join("\n")
      .trim();
    L.push(body);
    L.push("");
    L.push("---");
    L.push("");
  }

  return L.join("\n");
}

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
