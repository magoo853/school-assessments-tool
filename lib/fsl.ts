/**
 * Facility Security Level (FSL) determination engine.
 *
 * Implements ISC Risk Management Process (2021 Edition), Section 4:
 * five equally-weighted factors, 1–4 points each; bands I (5–7),
 * II (8–12), III (13–17), IV (18–20); an intangible factor allows a
 * ±1 FSL adjustment with documented justification. Level V facilities
 * are designated separately per Section 4.5 and are out of scope here.
 *
 * For non-federal facilities the result is labeled "FSL-equivalent" —
 * the methodology is borrowed, the standard's authority is federal
 * (EO 12977).
 */

export type FslLevel = "I" | "II" | "III" | "IV";
export type FslPoints = 1 | 2 | 3 | 4;

export interface FslScores {
  mission: FslPoints;
  symbolism: FslPoints;
  population: FslPoints;
  size: FslPoints;
  threat: FslPoints;
}

/** ISC matrix: <100 → 1, 101–250 → 2, 251–750 → 3, >750 → 4. */
export function populationPoints(headcount: number): FslPoints {
  if (headcount <= 100) return 1;
  if (headcount <= 250) return 2;
  if (headcount <= 750) return 3;
  return 4;
}

/** ISC matrix: <10k sqft → 1, 10–100k → 2, 100–250k → 3, >250k → 4. */
export function sizePoints(sqft: number): FslPoints {
  if (sqft <= 10000) return 1;
  if (sqft <= 100000) return 2;
  if (sqft <= 250000) return 3;
  return 4;
}

/** ISC bands: I 5–7, II 8–12, III 13–17, IV 18–20. */
export function bandForTotal(total: number): FslLevel {
  if (total <= 7) return "I";
  if (total <= 12) return "II";
  if (total <= 17) return "III";
  return "IV";
}

const ORDER: FslLevel[] = ["I", "II", "III", "IV"];

/** Intangible adjustment: ±1 FSL, clamped to I–IV, per Section 4.3. */
export function applyIntangible(
  preliminary: FslLevel,
  adj: -1 | 0 | 1
): FslLevel {
  const i = ORDER.indexOf(preliminary) + adj;
  return ORDER[Math.min(3, Math.max(0, i))];
}

export interface FslInputs {
  mission: FslPoints;
  symbolism: FslPoints;
  threat: FslPoints;
  populationCount: number | null;
  sizeSqft: number | null;
  symbolismLandBonus: boolean;
  intangibleAdj: -1 | 0 | 1;
}

export interface FslResult {
  scores: FslScores;
  total: number;
  preliminary: FslLevel;
  final: FslLevel;
}

/**
 * Compute the FSL from wizard inputs. Returns null when the numeric
 * inputs (population, size) are missing — the determination is
 * incomplete until all five factors are scored.
 */
export function computeFsl(inputs: FslInputs): FslResult | null {
  if (inputs.populationCount == null || inputs.sizeSqft == null) return null;
  // ISC §4.4.2: large land area contributing to target attractiveness
  // adds one symbolism point, not to exceed 4.
  const symbolism = Math.min(
    4,
    inputs.symbolism + (inputs.symbolismLandBonus ? 1 : 0)
  ) as FslPoints;
  const scores: FslScores = {
    mission: inputs.mission,
    symbolism,
    population: populationPoints(inputs.populationCount),
    size: sizePoints(inputs.sizeSqft),
    threat: inputs.threat,
  };
  const total =
    scores.mission +
    scores.symbolism +
    scores.population +
    scores.size +
    scores.threat;
  const preliminary = bandForTotal(total);
  return {
    scores,
    total,
    preliminary,
    final: applyIntangible(preliminary, inputs.intangibleAdj),
  };
}

/** "FSL II" for federal facilities, "FSL-equivalent II" otherwise. */
export function fslLabel(level: FslLevel, federalFacility: boolean): string {
  return federalFacility ? `FSL ${level}` : `FSL-equivalent ${level}`;
}

export interface FslQualitativeOption {
  points: FslPoints;
  label: string;
  hint: string;
}

export const FSL_QUALITATIVE: Record<
  "mission" | "symbolism" | "threat",
  { name: string; options: FslQualitativeOption[] }
> = {
  mission: {
    name: "Mission Criticality",
    options: [
      {
        points: 1,
        label: "Low",
        hint: "Local support functions; disruption has minimal wider impact.",
      },
      {
        points: 2,
        label: "Medium",
        hint: "Regional operations; disruption affects more than one site.",
      },
      {
        points: 3,
        label: "High",
        hint: "Statewide / multi-region operations; significant disruption if lost.",
      },
      {
        points: 4,
        label: "Very High",
        hint: "National leadership, continuity functions, or equivalent critical mission.",
      },
    ],
  },
  symbolism: {
    name: "Symbolism",
    options: [
      {
        points: 1,
        label: "Low",
        hint: "Not recognizable as a high-value target.",
      },
      {
        points: 2,
        label: "Medium",
        hint: "Some public profile; known locally as an institutional facility.",
      },
      {
        points: 3,
        label: "High",
        hint: "Well-known facility; an attack would draw regional attention.",
      },
      {
        points: 4,
        label: "Very High",
        hint: "Widely recognized symbol; an attack would have national impact.",
      },
    ],
  },
  threat: {
    name: "Threat to Tenant Agencies",
    options: [
      {
        points: 1,
        label: "Low",
        hint: "No specific threats; baseline local crime environment.",
      },
      {
        points: 2,
        label: "Medium",
        hint: "General threats in the area or sector; elevated local crime.",
      },
      {
        points: 3,
        label: "High",
        hint: "Credible threats to similar facilities; concerning intelligence.",
      },
      {
        points: 4,
        label: "Very High",
        hint: "Direct, credible threats to this facility or tenant type.",
      },
    ],
  },
};
