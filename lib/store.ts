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
 * - Tables are MODE-SCOPED: keys are sat_<mode>_<table>. DEMO and PROD
 *   are fully separate datasets on the device; switching modes never
 *   wipes anything. Legacy unprefixed sat_<table> data (pre-keyspace
 *   builds) is migrated once into the DEMO keyspace — that is what
 *   existing devices actually hold.
 */

import { getMode, type Mode } from "./mode";

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

export type ReviewState = "pending" | "approved" | "sent_back";

/** Peer-review / approval record on an assessment (optional; absent =
 *  never submitted for review). Workflow transitions live in
 *  lib/review.ts. Names are snapshots — there are no accounts yet, so
 *  this is an honest workflow record, not an enforced permission. */
export interface ReviewRecord {
  state: ReviewState;
  submittedBy: string;
  submittedAt: string;
  /** Assessor asked to review (optional; any reviewer may decide). */
  reviewerId?: string;
  reviewerName?: string;
  decidedBy?: string;
  decidedAt?: string;
  /** Decision comment — required when sent back. */
  comment?: string;
}

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
  review?: ReviewRecord;
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

/** Storage key for a mode-scoped dataset entry: sat_<mode>_<base>. */
export function modeKey(base: string, mode: Mode = getMode()): string {
  return `sat_${mode}_${base}`;
}

export const TABLE_BASES = [
  "assessments",
  "responses",
  "findings",
  "reports",
  "equipment",
  "assessors",
  "schedules",
  "clery_reports",
  "policy_docs",
  "custom_templates",
  "fsl_records",
] as const;

let migrationDone = false;
/**
 * One-time migration of legacy unprefixed keys (sat_<table>, sat_photos,
 * sat_seeded_v1) into the DEMO keyspace. Per-key and idempotent: a key
 * moves only when its demo counterpart doesn't exist yet, so a partial
 * (quota-interrupted) run resumes safely on the next access.
 */
export function ensureMigration(): void {
  if (migrationDone || !canStore()) return;
  migrationDone = true;
  try {
    const ls = window.localStorage;
    for (const base of TABLE_BASES) {
      const legacy = `sat_${base}`;
      const target = `sat_demo_${base}`;
      if (ls.getItem(target) === null && ls.getItem(legacy) !== null) {
        ls.setItem(target, ls.getItem(legacy) as string);
        ls.removeItem(legacy);
      }
    }
    if (
      ls.getItem("sat_demo_photos") === null &&
      ls.getItem("sat_photos") !== null
    ) {
      ls.setItem("sat_demo_photos", ls.getItem("sat_photos") as string);
      ls.removeItem("sat_photos");
    }
    if (
      ls.getItem("sat_demo_seeded_v1") === null &&
      ls.getItem("sat_seeded_v1") !== null
    ) {
      ls.setItem("sat_demo_seeded_v1", "1");
      ls.removeItem("sat_seeded_v1");
    }
  } catch {
    /* best-effort: un-migrated keys simply stay where they are */
  }
}

/* ── Storage failure signal ─────────────────────────────────────
 * Table.write() catches quota errors instead of throwing into event
 * handlers (which made saves look successful, then vanish on reload).
 * The failure is recorded here and broadcast; Shell renders a banner. */
export const STORAGE_ERROR_EVENT = "sat:storage-error";
let storageErrorKey: string | null = null;

export function getStorageError(): string | null {
  return storageErrorKey;
}

function signalStorageError(key: string): void {
  const first = storageErrorKey === null;
  storageErrorKey = key;
  if (first && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT));
  }
}

function clearStorageError(): void {
  if (storageErrorKey !== null) {
    storageErrorKey = null;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT));
    }
  }
}

/** Quarantine a corrupt payload instead of silently overwriting it:
 *  the original bytes are parked under sat_corrupt_<key> for diagnosis
 *  (surfaced in Integrations) and the table reads as empty. */
function quarantine(key: string, raw: string): void {
  try {
    const qk = `sat_corrupt_${key}`;
    if (window.localStorage.getItem(qk) !== raw) {
      window.localStorage.setItem(qk, raw);
    }
  } catch {
    /* quarantine is best-effort */
  }
}

export function getCorruptKeys(): string[] {
  if (!canStore()) return [];
  const out: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith("sat_corrupt_")) out.push(k.replace("sat_corrupt_", ""));
  }
  return out;
}

class Table<T extends { id: ID }> {
  private base: string;
  private cache: T[] | null = null;
  private cacheKey = "";
  constructor(key: string) {
    this.base = key;
  }
  private get key(): string {
    return modeKey(this.base);
  }
  private read(): T[] {
    if (!canStore()) return [];
    ensureMigration();
    const k = this.key;
    if (this.cache && this.cacheKey === k) return this.cache;
    let rows: T[] = [];
    try {
      const raw = window.localStorage.getItem(k);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) rows = parsed as T[];
        else quarantine(k, raw);
      }
    } catch {
      try {
        const raw = window.localStorage.getItem(k);
        if (raw) quarantine(k, raw);
      } catch {
        /* ignore */
      }
      rows = [];
    }
    this.cache = rows;
    this.cacheKey = k;
    return rows;
  }
  private write(rows: T[]): void {
    if (!canStore()) return;
    ensureMigration();
    const k = this.key;
    try {
      window.localStorage.setItem(k, JSON.stringify(rows));
      clearStorageError();
    } catch {
      signalStorageError(k);
    }
    this.cache = rows;
    this.cacheKey = k;
  }
  list(): T[] {
    return [...this.read()];
  }
  get(id: ID): T | undefined {
    return this.read().find((r) => r.id === id);
  }
  filter(fn: (r: T) => boolean): T[] {
    return this.read().filter(fn);
  }
  upsert(row: T): T {
    const rows = [...this.read()];
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
  /** Drop the parsed-row cache (call after writing localStorage
   *  directly, e.g. backup restore, so reads re-parse). */
  invalidate(): void {
    this.cache = null;
    this.cacheKey = "";
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

/**
 * Install demo seed data once (demo mode only). `seed` writes rows via db.
 * Safe to call on every page load; no-ops after the first run or in SSR.
 * The flag lives in the current mode's keyspace.
 */
export function ensureSeed(seed: () => void): void {
  if (!canStore()) return;
  ensureMigration();
  const flag = modeKey("seeded_v1");
  if (window.localStorage.getItem(flag)) return;
  seed();
  window.localStorage.setItem(flag, "1");
}

/** Wipe the CURRENT mode's tables + its seed flag. Other modes are
 *  untouched. (Mode switching no longer calls this — each mode keeps
 *  its own data; it remains for an explicit reset action.) */
export function clearAllData(): void {
  if (!canStore()) return;
  Object.values(db).forEach((t) => t.clear());
  window.localStorage.removeItem(modeKey("seeded_v1"));
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
