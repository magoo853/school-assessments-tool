/**
 * Full backup & restore of the on-device dataset.
 * Everything the app stores lives in localStorage under `sat_` keys
 * (tables, photos, profile, settings) — a backup is a verbatim copy
 * of those keys in one JSON file. Restore writes them back and the
 * caller reloads. The AI key (sat_ai_key) is NEVER included in a
 * backup file: it's a credential, not data.
 */
"use client";

export interface BackupFile {
  format: "sat-backup";
  version: 1;
  app: "school-assessments-tool";
  exportedAt: string;
  data: Record<string, string>;
}

const EXCLUDED_KEYS = new Set(["sat_ai_key"]);

export function buildBackup(): BackupFile {
  const data: Record<string, string> = {};
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith("sat_") || EXCLUDED_KEYS.has(key)) continue;
    const value = window.localStorage.getItem(key);
    if (value != null) data[key] = value;
  }
  return {
    format: "sat-backup",
    version: 1,
    app: "school-assessments-tool",
    exportedAt: new Date().toISOString(),
    data,
  };
}

export function backupFilename(): string {
  return `school-assessments-backup-${new Date().toISOString().slice(0, 10)}.json`;
}

export function summarizeBackup(raw: unknown): { exportedAt: string; entries: number } | { error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { error: "That file isn't a backup — it isn't a JSON object." };
  }
  const b = raw as Partial<BackupFile>;
  if (b.format !== "sat-backup" || b.version !== 1 || typeof b.data !== "object" || b.data === null) {
    return { error: "That file isn't a School Assessments Tool backup (format or version not recognized)." };
  }
  const keys = Object.keys(b.data);
  if (keys.length === 0) return { error: "The backup file is empty." };
  if (!keys.every((k) => k.startsWith("sat_"))) {
    return { error: "The backup file contains unexpected entries." };
  }
  return { exportedAt: b.exportedAt ?? "", entries: keys.length };
}

/** Replace the whole on-device dataset with the backup's contents.
 *  The device's AI key (excluded from backups) is preserved. */
export function restoreBackup(file: BackupFile): void {
  const keep: Record<string, string> = {};
  for (const key of EXCLUDED_KEYS) {
    const v = window.localStorage.getItem(key);
    if (v != null) keep[key] = v;
  }
  const existing: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith("sat_")) existing.push(key);
  }
  for (const key of existing) window.localStorage.removeItem(key);
  for (const [key, value] of Object.entries(file.data)) {
    if (EXCLUDED_KEYS.has(key)) continue;
    window.localStorage.setItem(key, value);
  }
  for (const [key, value] of Object.entries(keep)) {
    window.localStorage.setItem(key, value);
  }
}
