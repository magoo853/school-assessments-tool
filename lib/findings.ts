/**
 * Findings derivation.
 *
 * deriveFindings(assessmentId) reads the saved responses for an assessment and
 * creates one Finding per checkpoint answered "no".
 *
 * HARD RULE: a finding's gapText is ALWAYS a negative gap statement — never
 * the positive criterion wording. The negative statement comes from the
 * template checkpoint's explicit `gap` field; a safe generic fallback is used
 * only if a checkpoint cannot be resolved.
 */

import { db, uid, type Finding, type Risk } from "./store";
import { getCheckpoint } from "./templates";
import { resolveTemplate } from "./customTemplates";

const GENERIC_REC =
  "Address this gap in the campus safety improvement plan, prioritized by its risk rating.";

const FALLBACK_GAP =
  "Gap confirmed on site — the assessor marked this item as not met.";

/** Equipment-ish words; a note mentioning one spawns an equipment item. */
const EQUIPMENT_KEYWORDS = [
  "camera",
  "door",
  "lock",
  "alarm",
  "radio",
  "light",
  "fence",
  "gate",
  "intercom",
  "pa system",
  "panic",
  "mirror",
  "key",
  "window",
  "strobe",
  "badge",
  "vestibule",
  "dvr",
  "nvr",
  "cctv",
];

/** Canonical names an auto-derived equipment mention can carry — the
 *  single source of truth lib/equipmentCleanup.ts uses to recognise
 *  derived rows (a manually added item can use any name at all). */
export const DERIVED_EQUIPMENT_NAMES: string[] =
  EQUIPMENT_KEYWORDS.map(equipmentName);

function equipmentName(keyword: string): string {
  if (keyword === "pa system") return "PA system";
  if (keyword === "cctv") return "CCTV";
  if (keyword === "dvr") return "DVR";
  if (keyword === "nvr") return "NVR";
  return keyword.charAt(0).toUpperCase() + keyword.slice(1);
}

/**
 * Derive findings for an assessment, replacing any previously derived
 * findings for it. Returns the new findings.
 */
export function deriveFindings(assessmentId: string): Finding[] {
  const assessment = db.assessments.get(assessmentId);
  if (!assessment) return [];
  const template = resolveTemplate(assessment.templateId);

  // Snapshot the findings being replaced: corrective-action tracking is
  // carried over to the re-derived findings by checkpointKey, and the
  // old finding ids let equipment derivation stay idempotent.
  const previous = db.findings.filter((f) => f.assessmentId === assessmentId);
  const caByKey = new Map<string, Partial<Finding>>();
  const keyByOldFindingId = new Map<string, string>();
  for (const pf of previous) {
    keyByOldFindingId.set(pf.id, pf.checkpointKey);
    const ca: Partial<Finding> = {};
    if (pf.caStatus) ca.caStatus = pf.caStatus;
    if (pf.caOwner) ca.caOwner = pf.caOwner;
    if (pf.caDueDate) ca.caDueDate = pf.caDueDate;
    if (pf.caVerifiedAt) ca.caVerifiedAt = pf.caVerifiedAt;
    if (pf.caVerifiedBy) ca.caVerifiedBy = pf.caVerifiedBy;
    if (Object.keys(ca).length) caByKey.set(pf.checkpointKey, ca);
  }

  // Replace existing findings for this assessment.
  previous.forEach((f) => db.findings.remove(f.id));

  const nos = db.responses.filter(
    (r) => r.assessmentId === assessmentId && r.answer === "no"
  );

  const findings: Finding[] = [];
  for (const r of nos) {
    const hit = getCheckpoint(template, r.checkpointKey);
    const gapText = hit ? hit.checkpoint.gap : FALLBACK_GAP;
    const recommendation = hit ? hit.checkpoint.rec : GENERIC_REC;
    const risk: Risk = r.risk ?? "moderate";
    const finding: Finding = {
      id: uid("fnd"),
      assessmentId,
      checkpointKey: r.checkpointKey,
      gapText,
      risk,
      note: r.note || "",
      recommendation,
      ...(caByKey.get(r.checkpointKey) ?? {}),
    };
    db.findings.upsert(finding);
    findings.push(finding);
  }

  deriveEquipmentMentions(assessmentId, findings, keyByOldFindingId);
  return findings;
}

/**
 * Simple heuristic: when a finding's gap text or assessor note names
 * equipment, record it in db.equipment linked to the finding.
 * Idempotent across re-derivation: a mention already recorded for the
 * same checkpoint (via a previous finding id) is not added again.
 */
function deriveEquipmentMentions(
  assessmentId: string,
  findings: Finding[],
  keyByOldFindingId: Map<string, string>
): void {
  const existing = db.equipment.filter((e) => e.assessmentId === assessmentId);
  const coveredByKey = new Map<string, (typeof existing)[number]>();
  for (const e of existing) {
    const key = e.findingId ? keyByOldFindingId.get(e.findingId) : undefined;
    if (key) coveredByKey.set(`${key}|${e.name.toLowerCase()}`, e);
  }
  for (const f of findings) {
    const hay = `${f.gapText} ${f.note}`.toLowerCase();
    for (const kw of EQUIPMENT_KEYWORDS) {
      if (!hay.includes(kw)) continue;
      const name = equipmentName(kw);
      const prior = coveredByKey.get(`${f.checkpointKey}|${name.toLowerCase()}`);
      const dup = existing.some(
        (e) =>
          e.findingId === f.id && e.name.toLowerCase() === name.toLowerCase()
      );
      if (prior) {
        // Already recorded for this checkpoint — re-link it to the new
        // finding id so the chain survives the next re-derivation.
        if (prior.findingId !== f.id) {
          db.equipment.upsert({ ...prior, findingId: f.id });
          prior.findingId = f.id;
        }
      } else if (!dup) {
        const item = {
          id: uid("eqp"),
          assessmentId,
          findingId: f.id,
          name,
          detail: f.note || f.gapText,
          priority: f.risk,
        };
        db.equipment.upsert(item);
        existing.push(item);
      }
      break; // one equipment mention per finding from the heuristic
    }
  }
}
