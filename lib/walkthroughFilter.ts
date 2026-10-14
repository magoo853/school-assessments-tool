/**
 * Walkthrough "unanswered only" view — pure filtering logic.
 *
 * Finishing a 76-checkpoint visit in the field means hunting for the
 * handful of checkpoints that still have no answer. These helpers take
 * plain snapshots (template + responses keyed by checkpoint key) so
 * they can be harness-tested without the store or localStorage, and so
 * the taker page stays a thin renderer over them.
 *
 * A checkpoint counts as unanswered when there is no response row for
 * its key, or the row's answer is null/undefined. A note, risk rating,
 * or photo on its own does NOT answer a checkpoint — findings are
 * derived from answers, so an answered-looking row with no answer
 * would silently produce nothing.
 */

import type {
  AssessmentTemplate,
  Checkpoint,
  TemplateDomain,
} from "./templates";

/** Minimal answer shape — a ResponseRow satisfies this. */
export interface AnswerLike {
  answer?: string | null;
}

export type ResponsesByKey = Record<string, AnswerLike | undefined>;

export function isUnanswered(
  checkpointKey: string,
  responses: ResponsesByKey
): boolean {
  const r = responses[checkpointKey];
  return !r || r.answer === null || r.answer === undefined;
}

export interface DomainView {
  domain: TemplateDomain;
  /** Checkpoints to render (all of them, or only the unanswered ones). */
  checkpoints: Checkpoint[];
  answered: number;
  total: number;
  unanswered: number;
  /** True when every checkpoint in the domain is answered. */
  complete: boolean;
}

/** Per-domain view for one filter setting. Order follows the template. */
export function domainViews(
  template: AssessmentTemplate,
  responses: ResponsesByKey,
  unansweredOnly: boolean
): DomainView[] {
  return template.domains.map((domain) => {
    const total = domain.checkpoints.length;
    const unansweredCps = domain.checkpoints.filter((c) =>
      isUnanswered(c.key, responses)
    );
    const unanswered = unansweredCps.length;
    return {
      domain,
      checkpoints: unansweredOnly ? unansweredCps : domain.checkpoints,
      answered: total - unanswered,
      total,
      unanswered,
      complete: unanswered === 0,
    };
  });
}

/**
 * Total unanswered checkpoints across the template. Counts only keys
 * that belong to the template — stale responses from a previous
 * template (kept in storage after a switch) never inflate the count.
 */
export function countUnanswered(
  template: AssessmentTemplate,
  responses: ResponsesByKey
): number {
  let n = 0;
  for (const d of template.domains) {
    for (const c of d.checkpoints) {
      if (isUnanswered(c.key, responses)) n += 1;
    }
  }
  return n;
}
