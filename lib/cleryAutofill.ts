/**
 * Clery ASR autofill — start a new ASR from what the app already
 * knows about the school instead of a blank form:
 *
 *  - Schools come from the app's own records: client names on
 *    assessments and schedule entries, plus institutions that
 *    already have an ASR.
 *  - If the school filed an ASR before, its disclosure statements
 *    carry forward (they rarely change year to year) and its
 *    preparer carries over.
 *  - Disclosure gaps are filled from the policy library: a policy
 *    whose title/category matches a disclosure (e.g. a Drug &
 *    Alcohol policy for the alcohol & drug disclosure) supplies
 *    the statement text, marked complete for the user to review.
 *  - The preparer defaults to My Profile (name + the linked
 *    assessor record's title).
 *
 * Statistics are NOT autofilled — the app holds no crime counts,
 * and inventing them would be a compliance fabrication. Every
 * filled value stays editable in the ASR editor.
 */
import {
  db,
  type CleryDisclosure,
  type CleryReport,
  type PolicyDoc,
} from "./store";
import { getProfile } from "./profile";

/** Every school name the app knows in the current mode. */
export function knownSchools(): string[] {
  const names = new Set<string>();
  for (const a of db.assessments.list()) {
    if (a.clientName.trim()) names.add(a.clientName.trim());
  }
  for (const s of db.schedules.list()) {
    if (s.clientName.trim()) names.add(s.clientName.trim());
  }
  for (const r of db.cleryReports.list()) {
    if (r.institution.trim()) names.add(r.institution.trim());
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Most recent prior ASR for an institution (case-insensitive). */
export function priorAsrFor(institution: string): CleryReport | null {
  const target = institution.trim().toLowerCase();
  if (!target) return null;
  const matches = db.cleryReports
    .list()
    .filter((r) => r.institution.trim().toLowerCase() === target)
    .sort((a, b) => b.reportYear - a.reportYear);
  return matches[0] ?? null;
}

/** Terms matched against a policy's title + category, per disclosure. */
const POLICY_TERMS: Record<string, string[]> = {
  crimeReporting: ["crime reporting", "incident reporting", "reporting"],
  lawEnforcement: ["law enforcement", "resource officer", "sro"],
  securityAccess: ["visitor", "access control", "access"],
  timelyWarning: ["timely warning", "alert", "notification"],
  emergencyNotification: ["emergency notification", "crisis communication", "alert"],
  emergencyResponse: ["emergency operations", "emergency planning", "evacuation"],
  missingStudent: ["missing student", "missing child"],
  vawaPolicies: ["sexual", "vawa", "harassment", "dating violence", "title ix"],
  alcoholDrugs: ["drug", "alcohol", "substance"],
  fireSafety: ["fire safety", "fire drill", "fire"],
  crimeLog: ["crime log"],
  fireLog: ["fire log"],
};

/** Best-matching policy doc for a disclosure, or null. */
export function policyForDisclosure(
  key: string,
  policies: PolicyDoc[]
): PolicyDoc | null {
  const terms = POLICY_TERMS[key];
  if (!terms) return null;
  let best: PolicyDoc | null = null;
  let bestScore = 0;
  for (const p of policies) {
    const hay = `${p.title} ${p.category}`.toLowerCase();
    let score = 0;
    for (const t of terms) if (hay.includes(t)) score++;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

export interface AutofillResult {
  disclosures: CleryDisclosure[];
  /** Human-readable provenance lines for what was filled. */
  filledFrom: string[];
}

/**
 * Build the starting disclosures for a new ASR. Prior-ASR statements
 * win; the policy library fills what the prior ASR doesn't cover.
 * Blank disclosures pass through untouched.
 */
export function autofillDisclosures(
  institution: string,
  blank: CleryDisclosure[]
): AutofillResult {
  const prior = priorAsrFor(institution);
  const policies = db.policyDocs.list();
  const filledFrom: string[] = [];
  let carried = 0;
  let fromPolicy = 0;
  const disclosures = blank.map((d) => {
    const prev = prior?.disclosures.find((x) => x.key === d.key);
    if (prev && (prev.note.trim() || prev.complete)) {
      carried++;
      return { ...d, note: prev.note, complete: prev.complete };
    }
    const policy = policyForDisclosure(d.key, policies);
    if (policy) {
      fromPolicy++;
      return { ...d, note: policy.body, complete: true };
    }
    return d;
  });
  if (prior && carried > 0) {
    filledFrom.push(
      `${carried} disclosure statement${carried === 1 ? "" : "s"} carried forward from the ASR ${prior.reportYear}`
    );
  }
  if (fromPolicy > 0) {
    filledFrom.push(
      `${fromPolicy} disclosure${fromPolicy === 1 ? "" : "s"} filled from your policy library`
    );
  }
  return { disclosures, filledFrom };
}

/** Preparer defaults: the prior ASR's preparer, else My Profile. */
export function preparerDefaults(institution: string): {
  name: string;
  title: string;
} {
  const prior = priorAsrFor(institution);
  if (prior && (prior.preparerName || prior.preparerTitle)) {
    return { name: prior.preparerName, title: prior.preparerTitle };
  }
  const profile = getProfile();
  if (!profile) return { name: "", title: "" };
  const linked = profile.assessorId
    ? db.assessors.get(profile.assessorId)
    : undefined;
  return { name: profile.name, title: linked?.title ?? "" };
}
