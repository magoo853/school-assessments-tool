/**
 * Custom (assessor-built) templates.
 *
 * resolveTemplate(id) is the single entry point every consumer must use:
 * custom templates first, then the built-in getTemplate fallback. Custom
 * ids carry the "ct_" prefix so the two namespaces never collide.
 */
"use client";

import { db, nowIso, uid, type CustomTemplate, type ID } from "./store";
import {
  getTemplate,
  TEMPLATES,
  type AssessmentTemplate,
  type TemplateDomain,
} from "./templates";

export function isCustomTemplateId(id: string): boolean {
  return id.startsWith("ct_");
}

/** Custom templates first, built-in fallback — use everywhere. */
export function resolveTemplate(id: string): AssessmentTemplate {
  if (isCustomTemplateId(id)) {
    const c = db.customTemplates.get(id);
    if (c) return customToTemplate(c);
  }
  return getTemplate(id);
}

/** All templates for pickers: built-ins (read-only) + customs. */
export function allTemplates(): {
  template: AssessmentTemplate;
  custom: boolean;
}[] {
  return [
    ...TEMPLATES.map((t) => ({ template: t, custom: false })),
    ...db.customTemplates.list().map((c) => ({ template: customToTemplate(c), custom: true })),
  ];
}

/** True when an assessment references a template that no longer exists
 *  on this device (a deleted custom template, or an id that arrived via
 *  a backup from another device). resolveTemplate() silently falls
 *  back to a built-in in that case — callers should say so instead of
 *  presenting the fallback as the assessment's real template. */
export function isTemplateMissing(templateId: string | undefined): boolean {
  if (!templateId) return false;
  if (isCustomTemplateId(templateId)) {
    return !db.customTemplates.get(templateId);
  }
  return !TEMPLATES.some((t) => t.id === templateId);
}

/** How many assessments currently use a template. */
export function templateUsageCount(id: ID): number {
  return db.assessments.list().filter((a) => a.templateId === id).length;
}

function customToTemplate(c: CustomTemplate): AssessmentTemplate {
  const domains: TemplateDomain[] = c.domains.map((d) => ({
    id: d.id,
    name: d.name,
    checkpoints: d.checkpoints.map((cp) => ({
      key: cp.key,
      num: cp.num,
      text: cp.text,
      gap: cp.gap,
      rec: cp.rec,
    })),
  }));
  return { id: c.id, name: c.name, description: c.description, domains };
}

export function newCustomTemplate(): CustomTemplate {
  const t = nowIso();
  return {
    id: uid("ct"),
    name: "",
    description: "",
    domains: [],
    createdAt: t,
    updatedAt: t,
  };
}

export function saveCustomTemplate(t: CustomTemplate): CustomTemplate {
  const saved = { ...t, updatedAt: nowIso() };
  db.customTemplates.upsert(saved);
  return saved;
}

export function deleteCustomTemplate(id: ID): void {
  db.customTemplates.remove(id);
}

/** A template is referenced if any assessment or schedule uses it. */
export function templateInUse(id: ID): boolean {
  return (
    db.assessments.filter((a) => a.templateId === id).length > 0 ||
    db.schedules.filter((s) => s.templateId === id).length > 0
  );
}

/** Validation for the builder: name + at least one checkpoint. */
export function validateCustomTemplate(t: CustomTemplate): string | null {
  if (!t.name.trim()) return "Give the template a name.";
  const count = t.domains.reduce((n, d) => n + d.checkpoints.length, 0);
  if (count < 1) return "Add at least one checkpoint before saving.";
  return null;
}
