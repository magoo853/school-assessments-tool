/**
 * Stale equipment links cleanup.
 *
 * Before cycle 1 made equipment derivation idempotent, every
 * deriveFindings() re-derivation regenerated finding ids AND added a
 * fresh equipment row per mention — so devices that ran assessments
 * in that era carry equipment rows whose findingId points at a
 * finding generation that no longer exists ("stale links"). Cycle 1
 * re-links the one live mention per checkpoint; the rest linger.
 *
 * This module plans a one-time, user-confirmed cleanup pass over
 * those already-orphaned rows. The safety rule is absolute: a
 * manually added equipment item is NEVER deleted. There is no origin
 * marker on EquipmentItem, so deletion is allowed only for a row
 * that is a provable duplicate:
 *
 *   - its findingId is dead (no live finding with that id in the
 *     same assessment), AND
 *   - it is identical in assessment + name + detail + priority to
 *     either a live-linked row (a live twin already carries the
 *     mention) or to another orphaned row in the same group that is
 *     being KEPT (the survivor).
 *
 * Every other orphaned row is preserved and simply UNLINKED
 * (findingId cleared): reports already render unlinked equipment in
 * their own section, so nothing the assessor recorded disappears —
 * only the pointer at a dead finding goes away. Within a group of
 * identical orphans, only canonical-name rows (name matches a
 * derived-equipment name) are deletion candidates, and only past
 * the first survivor; a non-canonical orphan is deleted solely when
 * a live-linked identical twin already carries the mention.
 *
 * Pure planner (planEquipmentCleanup) takes plain snapshots so it
 * can be tested outside the browser; cleanupStaleEquipmentLinks()
 * applies the plan to the real store. No data-model change: the
 * pass only removes provable duplicate rows and clears findingId
 * on the rest (findingId is already optional).
 */
"use client";

import { db, type EquipmentItem, type Finding } from "./store";
import { DERIVED_EQUIPMENT_NAMES } from "./findings";

export interface EquipmentCleanupPlan {
  /** Orphaned rows that are provable duplicates — safe to delete. */
  deleteIds: string[];
  /** Orphaned rows to keep, with the stale findingId cleared. */
  unlinkIds: string[];
  /** Total rows whose findingId points at a dead finding. */
  staleCount: number;
}

const EMPTY_PLAN: EquipmentCleanupPlan = {
  deleteIds: [],
  unlinkIds: [],
  staleCount: 0,
};

function isLiveLink(e: EquipmentItem, findingsById: Map<string, Finding>): boolean {
  if (!e.findingId) return false;
  const f = findingsById.get(e.findingId);
  return Boolean(f && f.assessmentId === e.assessmentId);
}

/** Identity of a mention for duplicate purposes. Detail is part of
 *  the identity on purpose: two rows that differ in detail may be
 *  two genuinely different items (e.g. cameras in two locations). */
function mentionKey(e: EquipmentItem): string {
  return [
    e.assessmentId,
    e.name.toLowerCase(),
    e.detail,
    e.priority,
  ].join("|");
}

function isDerivedName(name: string): boolean {
  const n = name.toLowerCase();
  return DERIVED_EQUIPMENT_NAMES.some((d) => d.toLowerCase() === n);
}

/**
 * Plan the cleanup. Deterministic in input order: within an
 * identical-orphan group the first stored row is the survivor.
 */
export function planEquipmentCleanup(
  equipment: EquipmentItem[],
  findings: Finding[]
): EquipmentCleanupPlan {
  const findingsById = new Map(findings.map((f) => [f.id, f]));
  const orphaned = equipment.filter((e) => e.findingId && !isLiveLink(e, findingsById));
  if (orphaned.length === 0) return { ...EMPTY_PLAN };

  // Mention keys already carried by a live-linked row.
  const liveKeys = new Set(
    equipment.filter((e) => isLiveLink(e, findingsById)).map(mentionKey)
  );

  const deleteIds: string[] = [];
  const unlinkIds: string[] = [];
  const keptOrphanKeys = new Set<string>();

  for (const e of orphaned) {
    const key = mentionKey(e);
    if (liveKeys.has(key)) {
      // A live-linked twin carries this exact mention — duplicate.
      deleteIds.push(e.id);
      continue;
    }
    if (isDerivedName(e.name) && keptOrphanKeys.has(key)) {
      // Identical derived orphan already kept as the survivor.
      deleteIds.push(e.id);
      continue;
    }
    keptOrphanKeys.add(key);
    unlinkIds.push(e.id);
  }

  return { deleteIds, unlinkIds, staleCount: orphaned.length };
}

/* ── localStorage-facing wrappers ─────────────────────────────── */

/** The cleanup plan for the data currently on this device. */
export function getEquipmentCleanupPlan(): EquipmentCleanupPlan {
  return planEquipmentCleanup(db.equipment.list(), db.findings.list());
}

/**
 * Apply the cleanup pass: delete provable duplicates, clear the
 * stale findingId on every other orphaned row. Returns the plan
 * that was applied. A second run is a no-op (no stale links left).
 */
export function cleanupStaleEquipmentLinks(): EquipmentCleanupPlan {
  const equipment = db.equipment.list();
  const plan = planEquipmentCleanup(equipment, db.findings.list());
  const deleteSet = new Set(plan.deleteIds);
  const unlinkSet = new Set(plan.unlinkIds);
  for (const e of equipment) {
    if (deleteSet.has(e.id)) {
      db.equipment.remove(e.id);
    } else if (unlinkSet.has(e.id)) {
      // Rebuild without findingId — the field is optional, and an
      // absent link is exactly how unlinked equipment is represented.
      db.equipment.upsert({
        id: e.id,
        assessmentId: e.assessmentId,
        name: e.name,
        detail: e.detail,
        priority: e.priority,
      });
    }
  }
  return plan;
}
