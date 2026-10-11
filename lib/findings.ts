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
import { getTemplate, getCheckpoint } from "./templates";

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
  const template = getTemplate(assessment.templateId);

  // Replace existing findings for this assessment.
  db.findings
    .filter((f) => f.assessmentId === assessmentId)
    .forEach((f) => db.findings.remove(f.id));

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
    };
    db.findings.upsert(finding);
    findings.push(finding);
  }

  deriveEquipmentMentions(assessmentId, findings);
  return findings;
}

/**
 * Simple heuristic: when a finding's gap text or assessor note names
 * equipment, record it in db.equipment linked to the finding.
 */
function deriveEquipmentMentions(
  assessmentId: string,
  findings: Finding[]
): void {
  const existing = db.equipment.filter((e) => e.assessmentId === assessmentId);
  for (const f of findings) {
    const hay = `${f.gapText} ${f.note}`.toLowerCase();
    for (const kw of EQUIPMENT_KEYWORDS) {
      if (!hay.includes(kw)) continue;
      const name = equipmentName(kw);
      const dup = existing.some(
        (e) =>
          e.findingId === f.id && e.name.toLowerCase() === name.toLowerCase()
      );
      if (!dup) {
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
