/**
 * Full backup & restore of the on-device dataset.
 *
 * Datasets are MODE-SCOPED (sat_<mode>_<table>): a backup captures the
 * ACTIVE mode's tables + photos, stamps the file with that mode, and a
 * restore writes the data back into the FILE's mode keyspace — the
 * other mode on the device is never touched. Device-level singletons
 * (profile, branding) travel with the file. The AI key (sat_ai_key) is
 * NEVER included: it's a credential, not data, and the device's own
 * key is preserved across a restore.
 *
 * Backups from pre-keyspace builds have no `mode` field and legacy
 * unprefixed keys (sat_<table>); they are treated as DEMO data and
 * their keys are mapped into the demo keyspace on restore.
 *
 * Table/photo values are validated on restore (must parse to a JSON
 * array); anything invalid is skipped and reported, never written.
 */
"use client";

import { getMode, type Mode } from "./mode";
import { TABLE_BASES, db } from "./store";

export interface BackupFile {
  format: "sat-backup";
  version: 1;
  app: "school-assessments-tool";
  exportedAt: string;
  /** Dataset mode this backup belongs to (absent in legacy files). */
  mode?: Mode;
  data: Record<string, string>;
}

const EXCLUDED_KEYS = new Set(["sat_ai_key", "sat_mode_ls"]);
const SINGLETON_KEYS = new Set(["sat_profile", "sat_branding"]);

function isTableBase(key: string): boolean {
  return (TABLE_BASES as readonly string[]).includes(key);
}

/** The mode a backup file belongs to (legacy files are demo data). */
export function backupMode(file: BackupFile): Mode {
  return file.mode === "prod" ? "prod" : "demo";
}

export function buildBackup(mode: Mode = getMode()): BackupFile {
  const data: Record<string, string> = {};
  const prefix = `sat_${mode}_`;
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || EXCLUDED_KEYS.has(key)) continue;
    if (!key.startsWith(prefix) && !SINGLETON_KEYS.has(key)) continue;
    const value = window.localStorage.getItem(key);
    if (value != null) data[key] = value;
  }
  return {
    format: "sat-backup",
    version: 1,
    app: "school-assessments-tool",
    exportedAt: new Date().toISOString(),
    mode,
    data,
  };
}

export function backupFilename(mode: Mode = getMode()): string {
  return `school-assessments-backup-${mode}-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
}

export function summarizeBackup(
  raw: unknown
):
  | { exportedAt: string; entries: number; mode: Mode }
  | { error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { error: "That file isn't a backup — it isn't a JSON object." };
  }
  const b = raw as Partial<BackupFile>;
  if (
    b.format !== "sat-backup" ||
    b.version !== 1 ||
    typeof b.data !== "object" ||
    b.data === null
  ) {
    return {
      error:
        "That file isn't a School Assessments Tool backup (format or version not recognized).",
    };
  }
  const keys = Object.keys(b.data);
  if (keys.length === 0) return { error: "The backup file is empty." };
  if (!keys.every((k) => k.startsWith("sat_"))) {
    return { error: "The backup file contains unexpected entries." };
  }
  return {
    exportedAt: b.exportedAt ?? "",
    entries: keys.length,
    mode: b.mode === "prod" ? "prod" : "demo",
  };
}

export interface RestoreResult {
  /** Mode keyspace the data was written into. */
  mode: Mode;
  restored: number;
  /** File keys skipped (unrecognized or failed validation). */
  skipped: string[];
}

/** Map a backup entry key to its storage key in the target keyspace.
 *  Returns null for entries that must not be written. */
function targetKeyFor(key: string, mode: Mode): string | null {
  if (EXCLUDED_KEYS.has(key)) return null;
  if (SINGLETON_KEYS.has(key)) return key;
  if (key.startsWith("sat_corrupt_")) return null;
  // Already mode-scoped: only the file's own mode may be written.
  if (key.startsWith("sat_demo_") || key.startsWith("sat_prod_")) {
    return key.startsWith(`sat_${mode}_`) ? key : null;
  }
  // Legacy unprefixed entries → map into the target keyspace.
  if (key.startsWith("sat_")) {
    const base = key.slice(4);
    if (isTableBase(base) || base === "photos" || base === "seeded_v1") {
      return `sat_${mode}_${base}`;
    }
  }
  return null;
}

function isValidValue(targetKey: string, value: string): boolean {
  if (targetKey.endsWith("_seeded_v1")) return true;
  try {
    const parsed: unknown = JSON.parse(value);
    if (SINGLETON_KEYS.has(targetKey)) {
      return typeof parsed === "object" && parsed !== null;
    }
    return Array.isArray(parsed);
  } catch {
    return false;
  }
}

/**
 * Replace the FILE's mode keyspace with the backup's contents. The
 * other mode's data and the device's AI key are untouched.
 */
export function restoreBackup(file: BackupFile): RestoreResult {
  const mode = backupMode(file);
  const ls = window.localStorage;
  const prefix = `sat_${mode}_`;

  // Clear the target keyspace first so the restore is a true replace.
  const existing: string[] = [];
  for (let i = 0; i < ls.length; i++) {
    const key = ls.key(i);
    if (key && key.startsWith(prefix)) existing.push(key);
  }
  for (const key of existing) ls.removeItem(key);

  let restored = 0;
  const skipped: string[] = [];
  for (const [key, value] of Object.entries(file.data)) {
    if (EXCLUDED_KEYS.has(key)) continue;
    const target = targetKeyFor(key, mode);
    if (!target || !isValidValue(target, value)) {
      skipped.push(key);
      continue;
    }
    ls.setItem(target, value);
    restored++;
  }
  // Tables cache parsed rows — force re-parse after direct writes.
  Object.values(db).forEach((t) => t.invalidate());
  return { mode, restored, skipped };
}
