/**
 * Per-school remediation programs.
 *
 * A school's corrective actions can be grouped into a named program
 * (e.g. "Perimeter & classroom security — Fall 2026"). The member CAs
 * are the milestones: membership is stored by checkpoint key, so it
 * survives finding re-derivation (findings.ts preserves CA tracking by
 * checkpointKey) and reassessment (a fresh visit re-derives the same
 * checkpoints). Progress is DERIVED from the member CAs' states via
 * lib/ca.ts summarizeCa — never stored — so the program card, the
 * findings page and the generated reports always agree.
 *
 * Costs: this app's corrective actions carry NO cost fields, so a
 * program rolls up counts, states, owners and due dates only. No
 * dollar figure is estimated or invented anywhere in this module.
 *
 * Roles: the app has no accounts — the actor is the device profile's
 * name, recorded on the record (createdBy / completedBy), exactly the
 * honest-workflow snapshot the peer-review flow uses (lib/review.ts).
 */

import { summarizeCa, type CaSummary } from "./ca";
import { schoolKeyOf } from "./assets";
import {
  db,
  nowIso,
  uid,
  type Assessment,
  type Finding,
  type ProgramStatus,
  type RemediationProgram,
} from "./store";

export { schoolKeyOf };

export function programsForSchool(schoolKey: string): RemediationProgram[] {
  return db.programs
    .filter((p) => p.schoolKey === schoolKey)
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt));
}

export function programsForClient(clientName: string): RemediationProgram[] {
  return db.programs
    .filter((p) => p.clientName === clientName)
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt));
}

/**
 * The program's member CAs, resolved live: findings belonging to the
 * program's school whose checkpoint key is a member key. Resolution
 * takes every assessment of the school into account; a checkpoint
 * appears once per assessment, so a school mid-reassessment shows the
 * current visit's CA state for each member (the newest assessment
 * wins per checkpoint key).
 *
 * With `onlyAssessmentId`, resolution is pinned to that one
 * assessment — generated reports use this so a report's remediation
 * plan always agrees with that report's own findings, even after a
 * later reassessment starts the checkpoints fresh.
 */
export function resolveMembers(
  program: RemediationProgram,
  findings: Finding[],
  assessments: Assessment[],
  onlyAssessmentId?: string
): Finding[] {
  const byId = new Map(assessments.map((a) => [a.id, a]));
  const memberKeys = new Set(program.checkpointKeys);
  const byKey = new Map<string, { f: Finding; when: string }>();
  for (const f of findings) {
    if (!memberKeys.has(f.checkpointKey)) continue;
    if (onlyAssessmentId && f.assessmentId !== onlyAssessmentId) continue;
    const a = byId.get(f.assessmentId);
    if (!a) continue;
    if (schoolKeyOf(a.clientName, a.campus) !== program.schoolKey) continue;
    const when = a.completedAt ?? a.createdAt;
    const cur = byKey.get(f.checkpointKey);
    if (!cur || when >= cur.when) byKey.set(f.checkpointKey, { f, when });
  }
  return [...byKey.values()].map((x) => x.f);
}

export interface ProgramRollup {
  members: Finding[];
  summary: CaSummary;
  /** Headline progress: share of member CAs verified closed. */
  pctVerified: number;
  /** Earliest open due date among members, if any. */
  nextDue: string | null;
  owners: string[];
}

export function programRollup(
  program: RemediationProgram,
  findings: Finding[],
  assessments: Assessment[],
  onlyAssessmentId?: string
): ProgramRollup {
  const members = resolveMembers(program, findings, assessments, onlyAssessmentId);
  const summary = summarizeCa(members);
  const due = members
    .filter((f) => f.caDueDate && (f.caStatus ?? "open") !== "verified")
    .map((f) => f.caDueDate as string)
    .sort();
  return {
    members,
    summary,
    pctVerified: summary.total
      ? Math.round((summary.verified / summary.total) * 100)
      : 0,
    nextDue: due[0] ?? null,
    owners: [...new Set(members.map((f) => f.caOwner).filter(Boolean))] as string[],
  };
}

export function createProgram(opts: {
  clientName: string;
  campus: string;
  title: string;
  targetDate?: string;
  checkpointKeys: string[];
  createdBy: string;
}): RemediationProgram | null {
  const title = opts.title.trim();
  const createdBy = opts.createdBy.trim();
  if (!title || !createdBy || opts.checkpointKeys.length === 0) return null;
  const program: RemediationProgram = {
    id: uid("prg"),
    schoolKey: schoolKeyOf(opts.clientName, opts.campus),
    clientName: opts.clientName,
    campus: opts.campus,
    title,
    status: "planned",
    targetDate: opts.targetDate || undefined,
    checkpointKeys: [...new Set(opts.checkpointKeys)],
    createdBy,
    createdAt: nowIso(),
  };
  db.programs.upsert(program);
  return program;
}

export function setProgramStatus(
  programId: string,
  status: ProgramStatus,
  byName: string
): boolean {
  const p = db.programs.get(programId);
  if (!p) return false;
  if (status === "completed") {
    if (!byName.trim()) return false;
    db.programs.upsert({
      ...p,
      status,
      completedBy: byName.trim(),
      completedAt: nowIso(),
    });
  } else {
    db.programs.upsert({
      ...p,
      status,
      completedBy: undefined,
      completedAt: undefined,
    });
  }
  return true;
}

export function setProgramTargetDate(
  programId: string,
  targetDate: string | undefined
): void {
  const p = db.programs.get(programId);
  if (!p) return;
  db.programs.upsert({ ...p, targetDate: targetDate || undefined });
}

/** Add/remove a checkpoint from a program's membership. */
export function setProgramMember(
  programId: string,
  checkpointKey: string,
  member: boolean
): void {
  const p = db.programs.get(programId);
  if (!p) return;
  const keys = member
    ? [...new Set([...p.checkpointKeys, checkpointKey])]
    : p.checkpointKeys.filter((k) => k !== checkpointKey);
  db.programs.upsert({ ...p, checkpointKeys: keys });
}
