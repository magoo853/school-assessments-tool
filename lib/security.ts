/**
 * Security-analysis layer (2026-11-04, directed build "add 1-4",
 * translated from a cyber exposure-management teardown):
 *
 *  #2 Control tests — presence is not function; a checkpoint's test
 *     record lives on its ResponseRow (store.ControlTest). Helpers
 *     here classify test state for display.
 *  #3 Reachability-weighted priority — a finding's effective priority
 *     combines its base risk with exposure, the in-session factor,
 *     and compensating controls (incl. their test results). The math
 *     is computed in ONE place and rendered wherever priority shows.
 *  #1 Attack-path chaining — findings are placed on the intruder's
 *     physical path across campus zones; a chain of individually
 *     moderate gaps that forms one open path to students rates as
 *     the combination, not the parts.
 *
 * Pure functions over plain data (no db imports) so they can be
 * harness-tested outside the browser.
 */

import type {
  Exposure,
  Finding,
  ResponseRow,
  Risk,
} from "./store";

/* ------------------------------------------------------------------ */
/* Campus zones — the intruder's path, outside → in                    */
/* ------------------------------------------------------------------ */

export interface Zone {
  idx: number;
  label: string;
}

export const ZONES: Zone[] = [
  { idx: 0, label: "Street & grounds" },
  { idx: 1, label: "Campus perimeter" },
  { idx: 2, label: "Entry point" },
  { idx: 3, label: "Corridors & common areas" },
  { idx: 4, label: "Classrooms & offices" },
];

/** Non-spatial domains (cameras, comms, plans…) return null: they are
 *  not steps on the physical path, though they can compensate for it. */
const DOMAIN_ZONE: Record<string, number | null> = {
  perimeter: 1,
  parking: 0,
  exteriors: 2,
  entries: 2,
  interior: 4,
  lighting: null,
  cameras: null,
  comms: null,
  staffing: null,
  plans: null,
  it: null,
  unoccupied: 3,
  interviews: null,
  physical: 2,
};

const COMMON_AREA =
  /cafeteria|kitchen|corridor|hallway|\bhall\b|gym|auditorium|commons|stair/i;

/**
 * Zone of a checkpoint. `checkpointText` splits the broad interior
 * domain: cafeteria/kitchen/corridor checkpoints are common areas
 * (zone 3); classrooms and offices are the restricted core (zone 4).
 * Unknown domains fall back to keyword matching, then interior.
 */
export function zoneOf(
  domainId: string | undefined,
  checkpointText: string
): number | null {
  let z: number | null | undefined =
    domainId !== undefined ? DOMAIN_ZONE[domainId] : undefined;
  if (z === undefined && domainId) {
    // Domain NAME (report builders carry names, not ids).
    const n = domainId.toLowerCase();
    if (/perimeter|fencing/.test(n)) z = 1;
    else if (/parking|traffic/.test(n)) z = 0;
    else if (/entr|visitor|exterior|access/.test(n)) z = 2;
    else if (/interior|classroom/.test(n)) z = 4;
  }
  if (z === undefined) {
    const t = checkpointText.toLowerCase();
    if (/fence|gate|perimeter|boundary/.test(t)) z = 1;
    else if (/parking|playground|street|grounds|traffic/.test(t)) z = 0;
    else if (/visitor|vestibule|entry|entrance|exterior door/.test(t)) z = 2;
    else if (COMMON_AREA.test(t)) z = 3;
    else z = 4;
  }
  if (z === 4 && COMMON_AREA.test(checkpointText)) return 3;
  return z;
}

/** Default exposure for a zone — the reachability starting point an
 *  assessor can override per finding. */
export function exposureForZone(zone: number | null): Exposure {
  switch (zone) {
    case 0:
      return "public_street";
    case 1:
      return "campus_perimeter";
    case 2:
    case 3:
      return "controlled_interior";
    default:
      return "restricted";
  }
}

export const EXPOSURE_LABEL: Record<Exposure, string> = {
  public_street: "Public street",
  campus_perimeter: "Campus perimeter",
  controlled_interior: "Controlled interior",
  restricted: "Restricted interior",
};

/* ------------------------------------------------------------------ */
/* #2 — Control tests                                                  */
/* ------------------------------------------------------------------ */

export type TestState = "pass" | "fail" | "untested";

export function testStateOf(r: ResponseRow | undefined): TestState {
  if (!r?.test || r.test.result === "not_tested") return "untested";
  return r.test.result;
}

/** "Present, untested": the checkpoint passed (control is there) but
 *  nobody verified it works. */
export function isPresentUntested(r: ResponseRow | undefined): boolean {
  return r?.answer === "yes" && testStateOf(r) === "untested";
}

export function testSummaryLine(r: ResponseRow | undefined): string | null {
  if (!r?.test) return null;
  const t = r.test;
  if (t.result === "not_tested") return "Control test: not tested.";
  const parts = [
    `Control test: ${t.result === "pass" ? "PASS" : "FAIL"}`,
    t.method ? `— ${t.method}` : "",
    t.by ? `(${t.by}, ${t.at})` : `(${t.at})`,
  ];
  return parts.filter(Boolean).join(" ") + (t.note ? ` — ${t.note}` : "");
}

/* ------------------------------------------------------------------ */
/* #3 — Reachability-weighted priority                                 */
/* ------------------------------------------------------------------ */

export const RISK_POINTS: Record<Risk, number> = { low: 2, moderate: 4, high: 6 };

const EXPOSURE_POINTS: Record<Exposure, number> = {
  public_street: 2,
  campus_perimeter: 1,
  controlled_interior: 0,
  restricted: -1,
};

export interface PriorityMath {
  priority: Risk;
  points: number;
  /** The visible arithmetic, e.g. "Base Moderate (4) + public-street
   *  exposure (+2) + in session (+1) − compensating control tested
   *  pass (−1) = 6 → High". */
  line: string;
  exposure: Exposure;
  inSession: boolean;
  compensatingApplied: boolean;
  compensatingFailed: boolean;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Effective priority for a finding.
 * Points: base risk (Low 2 / Moderate 4 / High 6) + exposure
 * (street +2, perimeter +1, controlled interior 0, restricted −1)
 * + in-session +1 − compensating control 1 when a compensating
 * control is named AND (for checkpoint controls) its recorded test
 * passed; a compensating control whose test FAILED adds +1 instead.
 * Total ≤2 Low, 3–5 Moderate, ≥6 High.
 */
export function effectivePriority(
  f: Finding,
  response: ResponseRow | undefined,
  zone: number | null
): PriorityMath {
  const exposure: Exposure = f.reach?.exposure ?? exposureForZone(zone);
  const inSession = f.reach?.inSession ?? true;
  const named = (f.reach?.compensating ?? "").trim().length > 0;
  const ownTest = testStateOf(response);
  // A compensating control counts when one is named, or when the
  // checkpoint's own control was test-passed as the mitigation. A
  // failed test on the checkpoint's control removes the benefit.
  const compensatingApplied = (named || ownTest === "pass") && ownTest !== "fail";
  const compensatingFailed = ownTest === "fail";

  let points = RISK_POINTS[f.risk];
  const terms: string[] = [`Base ${cap(f.risk)} (${RISK_POINTS[f.risk]})`];
  const ep = EXPOSURE_POINTS[exposure];
  points += ep;
  terms.push(
    `${EXPOSURE_LABEL[exposure].toLowerCase()} exposure (${ep >= 0 ? "+" : ""}${ep})`
  );
  if (inSession) {
    points += 1;
    terms.push("in session (+1)");
  } else {
    terms.push("not in session (+0)");
  }
  if (compensatingFailed) {
    points += 1;
    terms.push("control tested FAIL (+1)");
  } else if (compensatingApplied) {
    points -= 1;
    terms.push("compensating control (−1)");
  }
  const priority: Risk = points >= 6 ? "high" : points >= 3 ? "moderate" : "low";
  return {
    priority,
    points,
    line: `${terms.join(" ")} = ${points} → ${cap(priority)}`,
    exposure,
    inSession,
    compensatingApplied,
    compensatingFailed,
  };
}

/* ------------------------------------------------------------------ */
/* #1 — Attack-path chaining                                           */
/* ------------------------------------------------------------------ */

export interface ChainStep {
  finding: Finding;
  zone: number;
  zoneLabel: string;
}

export interface AttackChain {
  steps: ChainStep[];
  rating: Risk;
  ratingRule: string;
  /** True when the chain reaches classrooms/offices (zone 4). */
  reachesStudents: boolean;
}

/**
 * Build the primary attack path for one assessment: the highest-risk
 * finding in each zone, zones ascending, from the outermost failed
 * checkpoint inward — the path an intruder would actually walk.
 * Returns null when fewer than 2 zoned findings exist (no path to
 * speak of).
 *
 * RATING RULE (stated wherever the rating shows): the chain rates as
 * the combination, not the parts — start from the highest step risk;
 * an unbroken chain of 3+ failed checkpoints reaching the corridors
 * (zone ≥3) escalates one level; a chain of 3+ reaching classrooms
 * (zone 4) with no tested-pass compensating control on any step
 * rates HIGH outright — several moderates forming one open path to
 * students are a high-risk path.
 */
export function buildAttackChain(
  findings: Finding[],
  zoneFor: (f: Finding) => number | null,
  responseFor: (f: Finding) => ResponseRow | undefined
): AttackChain | null {
  const byZone = new Map<number, Finding[]>();
  for (const f of findings) {
    const z = zoneFor(f);
    if (z === null) continue;
    const arr = byZone.get(z) ?? [];
    arr.push(f);
    byZone.set(z, arr);
  }
  const zones = [...byZone.keys()].sort((a, b) => a - b);
  if (zones.length < 2) return null;

  const sev = (r: Risk) => RISK_POINTS[r];
  const steps: ChainStep[] = zones.map((z) => {
    const best = [...(byZone.get(z) ?? [])].sort(
      (a, b) => sev(b.risk) - sev(a.risk)
    )[0];
    return { finding: best, zone: z, zoneLabel: ZONES[z].label };
  });

  const deepest = steps[steps.length - 1].zone;
  const reachesStudents = deepest >= 4;
  const base = steps.reduce<Risk>(
    (m, s) => (sev(s.finding.risk) > sev(m) ? s.finding.risk : m),
    "low"
  );
  const anyTestedPass = steps.some(
    (s) => testStateOf(responseFor(s.finding)) === "pass"
  );

  let rating: Risk = base;
  let ratingRule = `Chain rating: highest step (${cap(base)}), ${steps.length} linked steps.`;
  if (steps.length >= 3 && deepest >= 4 && !anyTestedPass) {
    rating = "high";
    ratingRule =
      "Chain rating: HIGH — 3+ linked failures reach classrooms/offices with no tested-pass compensating control on the path; the combination rates as one open path to students, above any single step.";
  } else if (steps.length >= 3 && deepest >= 3) {
    rating = base === "low" ? "moderate" : "high";
    ratingRule = `Chain rating: escalated one level from the highest step (${cap(base)}) — 3+ linked failures reach the corridors/common areas.`;
  }
  return { steps, rating, ratingRule, reachesStudents };
}
