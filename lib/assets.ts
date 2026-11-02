/**
 * School asset list — condition at touch + remaining life.
 *
 * Physical assets are touched during the walkthrough: a checkpoint
 * that concerns an asset class (door locks, cameras, AEDs, …) offers an
 * optional 1–5 condition score. The score lands on the school's own
 * asset list (db.assets, keyed by client + campus + checkpoint) — its
 * own record, NOT on the response — so a reassessment, which copies
 * answers forward and re-derives findings, never wipes the trend.
 *
 * Remaining life: where the asset's class has a known expected life
 * (ASSET_CLASSES) and an install year was recorded at a touch, age vs
 * expected life gives the remaining-life estimate and the
 * end-of-life flag ("replace, don't repair", with the basis shown).
 * Nothing is computed without an install year — no invented ages.
 */

import {
  db,
  nowIso,
  uid,
  type Assessment,
  type ConditionScore,
  type SchoolAsset,
} from "./store";

export interface AssetClassDef {
  label: string;
  /** Typical service life in years for the class (planning figure). */
  lifeYears: number;
}

/** Expected-life table by asset class. Lives are the standard planning
 *  figures used for school facilities (hardware duty cycles, vendor
 *  service guidance); they drive a forecast flag, not a verdict. */
export const ASSET_CLASSES: Record<string, AssetClassDef> = {
  aed: { label: "AED", lifeYears: 10 },
  extinguisher: { label: "Fire extinguisher", lifeYears: 12 },
  camera: { label: "Camera", lifeYears: 8 },
  dvr: { label: "DVR / NVR recorder", lifeYears: 7 },
  lock: { label: "Door lock hardware", lifeYears: 15 },
  gate: { label: "Gate hardware", lifeYears: 20 },
  fence: { label: "Fencing", lifeYears: 25 },
  vestibule: { label: "Entry vestibule", lifeYears: 30 },
  alarm: { label: "Alarm / fire panel", lifeYears: 15 },
  radio: { label: "Two-way radio", lifeYears: 8 },
  intercom: { label: "Intercom", lifeYears: 15 },
  pa: { label: "PA system", lifeYears: 15 },
  panic: { label: "Panic / duress button", lifeYears: 10 },
  badge: { label: "Badge / card reader", lifeYears: 10 },
  door: { label: "Door / entry", lifeYears: 25 },
  lighting: { label: "Lighting fixtures", lifeYears: 15 },
  window: { label: "Windows / glazing", lifeYears: 30 },
  mirror: { label: "Convex mirror", lifeYears: 20 },
  strobe: { label: "Strobe / beacon", lifeYears: 10 },
  key: { label: "Key control", lifeYears: 15 },
};

/** Ordered most-specific first: a "door lock" checkpoint is a lock,
 *  not a door; a "camera recorder" checkpoint is the recorder. */
const CLASS_RULES: { cls: string; words: string[] }[] = [
  { cls: "aed", words: ["aed", "defibrillator"] },
  { cls: "extinguisher", words: ["extinguisher"] },
  { cls: "dvr", words: ["dvr", "nvr", "recorder"] },
  { cls: "camera", words: ["camera", "cctv"] },
  { cls: "lock", words: ["lock", "lockable", "unlocked", "lockset", "latch"] },
  { cls: "gate", words: ["gate"] },
  { cls: "fence", words: ["fence", "fencing"] },
  { cls: "vestibule", words: ["vestibule", "sally-port", "sally port"] },
  { cls: "alarm", words: ["alarm", "fire panel"] },
  { cls: "radio", words: ["radio"] },
  { cls: "intercom", words: ["intercom"] },
  { cls: "pa", words: ["pa system", "public address"] },
  { cls: "panic", words: ["panic", "duress"] },
  { cls: "badge", words: ["badge reader", "card reader", "access control"] },
  { cls: "door", words: ["door", "entry", "entries"] },
  { cls: "lighting", words: ["lighting", "light fixture"] },
  { cls: "window", words: ["window", "glazing"] },
  { cls: "mirror", words: ["mirror"] },
  { cls: "strobe", words: ["strobe", "beacon"] },
  { cls: "key", words: ["key control", "key management"] },
];

const matchers = new Map<string, RegExp>();
function wordHit(hay: string, word: string): boolean {
  let re = matchers.get(word);
  if (!re) {
    const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(`\\b${esc}(?:s|es|ed|ing)?\\b`, "i");
    matchers.set(word, re);
  }
  return re.test(hay);
}

/**
 * The asset class a checkpoint concerns, from the template's own
 * wording — or null when the checkpoint isn't about a physical asset
 * (plans, training, procedures…). The criterion text decides first:
 * it names the checkpoint's subject ("Gates secured…" is a gate even
 * though its gap statement mentions gates being unlocked). The gap
 * statement is only a fallback for criteria that name no asset.
 */
export function assetClassForCheckpoint(cp: {
  text: string;
  gap: string;
}): string | null {
  for (const hay of [cp.text, `${cp.text} ${cp.gap}`]) {
    for (const rule of CLASS_RULES) {
      if (rule.words.some((w) => wordHit(hay, w))) return rule.cls;
    }
  }
  return null;
}

export function assetClassLabel(cls: string): string {
  return ASSET_CLASSES[cls]?.label ?? cls;
}

export function schoolKeyOf(clientName: string, campus: string): string {
  return `${clientName.trim()}\n${(campus ?? "").trim()}`;
}

export function assetsForSchool(schoolKey: string): SchoolAsset[] {
  return db.assets
    .filter((a) => a.schoolKey === schoolKey)
    .sort((x, y) => x.label.localeCompare(y.label));
}

export function assetForCheckpoint(
  schoolKey: string,
  checkpointKey: string
): SchoolAsset | undefined {
  return db.assets.filter(
    (a) => a.schoolKey === schoolKey && a.checkpointKey === checkpointKey
  )[0];
}

/**
 * Record (or update) a condition observation at a touch. One entry per
 * assessment: re-scoring during the same visit revises that visit's
 * entry instead of stacking duplicates. A null score clears this
 * visit's entry (the asset and its other visits' history stay).
 * installYear, when passed, is recorded on the asset itself.
 */
export function recordCondition(opts: {
  assessment: Assessment;
  checkpointKey: string;
  checkpointNum: string;
  assetClass: string;
  score: number | null;
  installYear?: number | null;
  byName?: string;
}): SchoolAsset | null {
  const { assessment } = opts;
  const schoolKey = schoolKeyOf(assessment.clientName, assessment.campus);
  let asset = assetForCheckpoint(schoolKey, opts.checkpointKey);
  if (!asset) {
    if (opts.score == null && opts.installYear == null) return null;
    asset = {
      id: uid("ast"),
      schoolKey,
      clientName: assessment.clientName,
      campus: assessment.campus,
      checkpointKey: opts.checkpointKey,
      assetClass: opts.assetClass,
      label: `${assetClassLabel(opts.assetClass)} — checkpoint ${opts.checkpointNum}`,
      scores: [],
    };
  }
  const scores = asset.scores.filter(
    (s) => s.assessmentId !== assessment.id
  );
  if (opts.score != null) {
    const entry: ConditionScore = {
      assessmentId: assessment.id,
      date: nowIso(),
      score: Math.min(5, Math.max(1, Math.round(opts.score))),
      byName: opts.byName?.trim() || undefined,
    };
    scores.push(entry);
  }
  scores.sort((x, y) => x.date.localeCompare(y.date));
  const next: SchoolAsset = {
    ...asset,
    scores,
    installYear:
      opts.installYear === undefined
        ? asset.installYear
        : (opts.installYear ?? undefined),
  };
  db.assets.upsert(next);
  return next;
}

/** Record just an install year (asset-card edit) without a score. */
export function setInstallYear(assetId: string, year: number | null): void {
  const a = db.assets.get(assetId);
  if (!a) return;
  db.assets.upsert({ ...a, installYear: year ?? undefined });
}

export function latestScore(asset: SchoolAsset): ConditionScore | null {
  return asset.scores.length
    ? asset.scores[asset.scores.length - 1]
    : null;
}

/** "4 → 3 → 2" across visits, oldest first; "" with fewer than 2. */
export function scoreTrend(asset: SchoolAsset): string {
  if (asset.scores.length < 2) return "";
  return asset.scores.map((s) => String(s.score)).join(" → ");
}

export type LifeState = "unknown" | "ok" | "near" | "past";

export interface AssetLife {
  state: LifeState;
  age: number | null;
  expected: number;
  remaining: number | null;
}

/**
 * Remaining-life estimate for an asset. Unknown until an install year
 * is recorded. "past" = at/past expected life; "near" = ≤ 2 years left.
 */
export function assetLife(
  asset: SchoolAsset,
  currentYear: number = new Date().getFullYear()
): AssetLife {
  const expected = ASSET_CLASSES[asset.assetClass]?.lifeYears ?? 0;
  if (!asset.installYear || !expected) {
    return { state: "unknown", age: null, expected, remaining: null };
  }
  const age = Math.max(0, currentYear - asset.installYear);
  const remaining = expected - age;
  return {
    state: remaining <= 0 ? "past" : remaining <= 2 ? "near" : "ok",
    age,
    expected,
    remaining,
  };
}

/** The one-line basis for a replacement flag, e.g.
 *  "installed 2010 · age 16 yrs vs 15-yr expected life for door lock hardware". */
export function lifeBasis(
  asset: SchoolAsset,
  currentYear: number = new Date().getFullYear()
): string {
  const life = assetLife(asset, currentYear);
  if (life.state === "unknown" || !asset.installYear) return "";
  return `installed ${asset.installYear} · age ${life.age} yrs vs ${life.expected}-yr expected life for ${assetClassLabel(asset.assetClass).toLowerCase()}`;
}

/** Assets on a school's list whose remaining life has run out or is
 *  about to — the replacement-forecast set. */
export function flaggedAssets(
  schoolKey: string,
  currentYear: number = new Date().getFullYear()
): SchoolAsset[] {
  return assetsForSchool(schoolKey).filter((a) => {
    const s = assetLife(a, currentYear).state;
    return s === "past" || s === "near";
  });
}
