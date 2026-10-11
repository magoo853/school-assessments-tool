/**
 * Dashboard data access — computed live from the db tables.
 *
 * getReassessment implements the 12-month reassessment clock per client:
 * due date = most recent completed assessment date + 12 months.
 * Contract matches lib/schedule#getReassessment (schedule slice);
 * that slice may replace this local implementation at integration.
 */
"use client";

import { db } from "./store";

export interface DashboardStats {
  scheduled: number;
  inProgress: number;
  completed: number;
  highRiskFindings: number;
}

export function getDashboardStats(): DashboardStats {
  return {
    scheduled: db.schedules.filter((s) => s.status === "scheduled").length,
    inProgress: db.assessments.filter((a) => a.status === "in_progress").length,
    completed: db.assessments.filter((a) => a.status === "completed").length,
    highRiskFindings: db.findings.filter((f) => f.risk === "high").length,
  };
}

export type ReassessState = "overdue" | "due-soon" | "ok" | "none";

export interface ReassessInfo {
  clientName: string;
  lastDate: string | null;
  dueDate: string | null;
  state: ReassessState;
}

export function getReassessment(clientName: string): ReassessInfo {
  const done = db.assessments
    .filter((a) => a.status === "completed" && !!a.completedAt)
    .filter((a) => a.clientName === clientName)
    .map((a) => (a.completedAt as string).slice(0, 10))
    .sort();
  const lastDate = done.length ? done[done.length - 1] : null;
  if (!lastDate) return { clientName, lastDate: null, dueDate: null, state: "none" };
  const due = new Date(`${lastDate}T12:00:00`);
  due.setFullYear(due.getFullYear() + 1);
  const dueDate = due.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const diffDays = Math.round(
    (new Date(`${dueDate}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) /
      86400000,
  );
  const state: ReassessState = diffDays < 0 ? "overdue" : diffDays <= 90 ? "due-soon" : "ok";
  return { clientName, lastDate, dueDate, state };
}

/**
 * Transparent safety score for one assessment.
 * Formula: 100 − 10 per high-risk finding − 5 per moderate − 2 per low, floored at 0.
 * Shown verbatim on the client history page so the number is auditable.
 */
export interface SafetyScore {
  score: number;
  high: number;
  moderate: number;
  low: number;
}

export function safetyScore(assessmentId: string): SafetyScore {
  const findings = db.findings.filter((f) => f.assessmentId === assessmentId);
  const high = findings.filter((f) => f.risk === "high").length;
  const moderate = findings.filter((f) => f.risk === "moderate").length;
  const low = findings.filter((f) => f.risk === "low").length;
  const score = Math.max(0, 100 - 10 * high - 5 * moderate - 2 * low);
  return { score, high, moderate, low };
}

/** Per-assessor workload across schedules and assessments. */
export interface AssessorWorkload {
  scheduled: number;
  inProgress: number;
  completed: number;
}

export function assessorWorkload(assessorId: string): AssessorWorkload {
  const onAssessment = (a: { assessorIds: string[]; leadAssessorId?: string }) =>
    a.leadAssessorId === assessorId || a.assessorIds.includes(assessorId);
  return {
    scheduled: db.schedules.filter(
      (s) => s.assessorId === assessorId && s.status === "scheduled"
    ).length,
    inProgress: db.assessments.filter(
      (a) => a.status === "in_progress" && onAssessment(a)
    ).length,
    completed: db.assessments.filter(
      (a) => a.status === "completed" && onAssessment(a)
    ).length,
  };
}
