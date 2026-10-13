/**
 * School Assessments Tool — data layer.
 *
 * localStorage-backed tables shaped like the future Supabase schema
 * (assessments, responses, findings, reports, equipment, assessors,
 * schedules, clery_reports, policy_docs, custom_templates; photos live in
 * their own table via lib/photos.ts).
 *
 * RULES for feature code:
 * - Every page that touches data is a client component ("use client").
 * - Import { db, uid, nowIso } from "@/lib/store".
 * - localStorage is guarded for SSR; all methods are safe to call anywhere
 *   but only persist in the browser.
 * - Demo seed data is installed by lib/seed.ts via ensureSeed(). Feature
 *   code must render gracefully when tables are empty (never assume seed).
 */

export type ID = string;

export function uid(prefix: string): ID {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export type Answer = "yes" | "no" | "na";
export type Risk = "low" | "moderate" | "high";
export type AssessmentStatus = "draft" | "in_progress" | "completed";
export type ScheduleStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export interface Assessment {
  id: ID;
  clientName: string;
  campus: string;
  templateId: string;
  status: AssessmentStatus;
  assessorIds: string[];
  leadAssessorId?: string;
  scheduledId?: string;
  focusNotes: string;
  createdAt: string;
  completedAt?: string;
  cover: { date: string; assessors: string; escort: string; weather: string };
}

export interface ResponseRow {
  id: ID;
  assessmentId: ID;
  checkpointKey: string;
  answer: Answer | null;
  risk: Risk | null;
  note: string;
  photoRef: string;
  /** Photo evidence ids → lib/photos.ts (sat_photos table). Optional for
   *  backward compatibility with rows stored before photo support. */
  photoIds?: string[];
}

export type CaStatus = "open" | "in_progress" | "corrected" | "verified";

export interface Finding {
  id: ID;
  assessmentId: ID;
  checkpointKey: string;
  /** Negative gap statement, e.g. "Several classroom doors cannot be locked from the inside". */
  gapText: string;
  risk: Risk;
  note: string;
  recommendation: string;
  /** Photo evidence ids → lib/photos.ts (sat_photos table). */
  photoIds?: string[];
  /** Corrective-action tracking (optional; absent = open). Preserved
   *  across deriveFindings() re-derivation by checkpointKey. */
  caStatus?: CaStatus;
  caOwner?: string;
  caDueDate?: string; // YYYY-MM-DD
  caVerifiedAt?: string;
  caVerifiedBy?: string;
}

export interface EquipmentItem {
  id: ID;
  assessmentId: ID;
  findingId?: string;
  name: string;
  detail: string;
  priority: Risk;
}

export type ReportKind = "aar" | "findings" | "recommendations";

export interface ReportDoc {
  id: ID;
  assessmentId: ID;
  kind: ReportKind;
  title: string;
  markdown: string;
  updatedAt: string;
}

export type ClearanceStatus = "current" | "pending" | "expired";

/**
 * Facility Security Level determination record (ISC RMP 2021, §4).
 * One per assessment; upserted by the FSL wizard. The computed fields
 * (total/preliminary/final) are snapshotted for the audit trail —
 * recompute with lib/fsl computeFsl() to verify.
 */
export interface FslRecord {
  id: ID;
  assessmentId: ID;
  /** False → labeled "FSL-equivalent" (non-federal facility). */
  federalFacility: boolean;
  mission: 1 | 2 | 3 | 4;
  symbolism: 1 | 2 | 3 | 4;
  threat: 1 | 2 | 3 | 4;
  populationCount: number | null;
  sizeSqft: number | null;
  /** ISC §4.4.2: large land area contributing to target attractiveness (+1 symbolism, max 4). */
  symbolismLandBonus: boolean;
  symbolismLandRationale: string;
  factorNotes: {
    mission: string;
    symbolism: string;
    population: string;
    size: string;
    threat: string;
  };
  intangibleAdj: -1 | 0 | 1;
  intangibleJustification: string;
  total: number;
  preliminary: "I" | "II" | "III" | "IV";
  final: "I" | "II" | "III" | "IV";
  assessedBy: string;
  assessedAt: string;
  updatedAt: string;
}

export interface Assessor {
  id: ID;
  name: string;
  title: string;
  photo?: string; // data URL
  phone: string;
  email: string;
  clearanceStatus: ClearanceStatus;
  clearanceDate?: string;
  clearanceExpiry?: string;
  clearanceLetter?: string; // data URL
  notes: string;
}

export interface ScheduleItem {
  id: ID;
  clientName: string;
  campus: string;
  date: string; // YYYY-MM-DD
  templateId: string;
  assessorId?: string;
  focusNotes: string;
  status: ScheduleStatus;
  assessmentId?: string;
}

export interface CleryStatRow {
  id: ID;
  reportId: ID;
  year: number;
  group: string; // e.g. "Criminal offenses", "VAWA", "Hate crimes", "Arrests & referrals", "Fire statistics", "Hazing"
  offense: string;
  geo: string; // onCampus | residential | noncampus | publicProperty
  value: number | null; // null = not entered (never 0 unless confirmedZero)
  confirmedZero: boolean;
}

export interface CleryDisclosure {
  key: string;
  label: string;
  complete: boolean;
  note: string;
  requiredFromYear?: number;
}

export interface CleryReport {
  id: ID;
  institution: string;
  reportYear: number;
  preparerName: string;
  preparerTitle: string;
  stats: CleryStatRow[];
  disclosures: CleryDisclosure[];
  createdAt: string;
  updatedAt: string;
}

export interface PolicyDoc {
  id: ID;
  title: string;
  category: string;
  body: string; // markdown
  updatedAt: string;
}

/**
 * Assessor-built assessment template. Same domain/checkpoint shape as the
 * built-in templates (see lib/templates.ts) so every consumer — walkthrough,
 * reports, hub export — treats them identically. Custom ids use the "ct_"
 * prefix to distinguish them from built-in ids ("isc42", "fl-fssat", "la").
 */
export interface CustomTemplate {
  id: ID;
  name: string;
  description: string;
  domains: { id: string; name: string; checkpoints: { key: string; num: string; text: string; gap: string; rec: string }[] }[];
  createdAt: string;
  updatedAt: string;
}

function canStore(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

class Table<T extends { id: ID }> {
  private key: string;
  constructor(key: string) {
    this.key = `sat_${key}`;
  }
  private read(): T[] {
    if (!canStore()) return [];
    try {
      const raw = window.localStorage.getItem(this.key);
      return raw ? (JSON.parse(raw) as T[]) : [];
    } catch {
      return [];
    }
  }
  private write(rows: T[]): void {
    if (!canStore()) return;
    window.localStorage.setItem(this.key, JSON.stringify(rows));
  }
  list(): T[] {
    return this.read();
  }
  get(id: ID): T | undefined {
    return this.read().find((r) => r.id === id);
  }
  filter(fn: (r: T) => boolean): T[] {
    return this.read().filter(fn);
  }
  upsert(row: T): T {
    const rows = this.read();
    const i = rows.findIndex((r) => r.id === row.id);
    if (i >= 0) rows[i] = row;
    else rows.push(row);
    this.write(rows);
    return row;
  }
  remove(id: ID): void {
    this.write(this.read().filter((r) => r.id !== id));
  }
  clear(): void {
    this.write([]);
  }
}

/** All tables. Shaped 1:1 like the future Supabase schema. */
export const db = {
  assessments: new Table<Assessment>("assessments"),
  responses: new Table<ResponseRow>("responses"),
  findings: new Table<Finding>("findings"),
  reports: new Table<ReportDoc>("reports"),
  equipment: new Table<EquipmentItem>("equipment"),
  assessors: new Table<Assessor>("assessors"),
  schedules: new Table<ScheduleItem>("schedules"),
  cleryReports: new Table<CleryReport>("clery_reports"),
  policyDocs: new Table<PolicyDoc>("policy_docs"),
  customTemplates: new Table<CustomTemplate>("custom_templates"),
  fslRecords: new Table<FslRecord>("fsl_records"),
};

const SEED_FLAG = "sat_seeded_v1";

/**
 * Install demo seed data once (demo mode only). `seed` writes rows via db.
 * Safe to call on every page load; no-ops after the first run or in SSR.
 */
export function ensureSeed(seed: () => void): void {
  if (!canStore()) return;
  if (window.localStorage.getItem(SEED_FLAG)) return;
  seed();
  window.localStorage.setItem(SEED_FLAG, "1");
}

/** Wipe all local data (used when switching modes). */
export function clearAllData(): void {
  if (!canStore()) return;
  Object.values(db).forEach((t) => t.clear());
  window.localStorage.removeItem(SEED_FLAG);
}

/** Factory for a fresh assessment (used by schedule start-walkthrough too). */
export function newAssessment(partial: Partial<Assessment> & { clientName: string }): Assessment {
  return {
    id: uid("asm"),
    campus: "Main campus",
    templateId: "isc42",
    status: "draft",
    assessorIds: [],
    focusNotes: "",
    createdAt: nowIso(),
    cover: { date: new Date().toISOString().slice(0, 10), assessors: "", escort: "", weather: "" },
    ...partial,
  };
}
