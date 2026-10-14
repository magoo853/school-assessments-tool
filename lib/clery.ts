/**
 * Clery Act Annual Security Report (ASR) builder — constants and helpers.
 *
 * Filing-correctness rules enforced here:
 * - An ASR for report year Y covers statistics for Y-3, Y-2, Y-1. It NEVER
 *   covers year Y itself.
 * - Unentered cells are null and print as "—" (em dash). They never print as 0.
 * - A literal 0 only appears after an explicit confirm-genuine-zero step
 *   (stored as value=0, confirmedZero=true).
 */

import { uid, nowIso } from "./store";
import type { CleryReport, CleryStatRow, CleryDisclosure } from "./store";

export type CleryGeo = "onCampus" | "residential" | "noncampus" | "publicProperty";

export const GEOS: { key: CleryGeo; label: string; short: string }[] = [
  { key: "onCampus", label: "On campus (total)", short: "On campus" },
  { key: "residential", label: "On-campus residential facilities", short: "Residential*" },
  { key: "noncampus", label: "Noncampus buildings or property", short: "Noncampus" },
  { key: "publicProperty", label: "Public property", short: "Public" },
];

export interface OffenseDef {
  key: string;
  label: string;
}

export interface OffenseGroup {
  key: string;
  label: string;
  offenses: OffenseDef[];
}

/** Six stat groups for the ASR crime-statistics tables. */
export const OFFENSE_GROUPS: OffenseGroup[] = [
  {
    key: "criminal",
    label: "Criminal offenses",
    offenses: [
      { key: "murder", label: "Murder / Non-negligent manslaughter" },
      { key: "negligentManslaughter", label: "Manslaughter by negligence" },
      { key: "rape", label: "Rape" },
      { key: "fondling", label: "Fondling" },
      { key: "incest", label: "Incest" },
      { key: "statutoryRape", label: "Statutory rape" },
      { key: "robbery", label: "Robbery" },
      { key: "aggravatedAssault", label: "Aggravated assault" },
      { key: "burglary", label: "Burglary" },
      { key: "motorVehicleTheft", label: "Motor vehicle theft" },
      { key: "arson", label: "Arson" },
    ],
  },
  {
    key: "vawa",
    label: "VAWA offenses",
    offenses: [
      { key: "domesticViolence", label: "Domestic violence" },
      { key: "datingViolence", label: "Dating violence" },
      { key: "stalking", label: "Stalking" },
    ],
  },
  {
    key: "hate",
    label: "Hate crimes by bias",
    offenses: [
      { key: "biasRace", label: "Race" },
      { key: "biasReligion", label: "Religion" },
      { key: "biasSexualOrientation", label: "Sexual orientation" },
      { key: "biasGender", label: "Gender" },
      { key: "biasGenderIdentity", label: "Gender identity" },
      { key: "biasDisability", label: "Disability" },
      { key: "biasEthnicity", label: "Ethnicity" },
      { key: "biasNationalOrigin", label: "National origin" },
    ],
  },
  {
    key: "arrests",
    label: "Arrests & disciplinary referrals",
    offenses: [
      { key: "arrestWeapons", label: "Arrests — Weapons violations" },
      { key: "arrestDrugs", label: "Arrests — Drug abuse violations" },
      { key: "arrestLiquor", label: "Arrests — Liquor law violations" },
      { key: "referralWeapons", label: "Disciplinary referrals — Weapons" },
      { key: "referralDrugs", label: "Disciplinary referrals — Drug abuse" },
      { key: "referralLiquor", label: "Disciplinary referrals — Liquor law" },
    ],
  },
  {
    key: "hazing",
    label: "Hazing statistics",
    offenses: [
      { key: "hazingIncidents", label: "Hazing incidents reported" },
      { key: "hazingOrganizations", label: "Student organizations found responsible for hazing" },
    ],
  },
  {
    key: "fire",
    label: "Fire statistics",
    offenses: [
      { key: "fires", label: "Fires in on-campus student housing" },
      { key: "fireInjuries", label: "Fire-related injuries" },
      { key: "fireDeaths", label: "Fire-related deaths" },
    ],
  },
];

export interface DisclosureDef {
  key: string;
  label: string;
  hint: string;
  requiredFromYear?: number;
}

/** Policy disclosure statements the ASR must contain (34 CFR 668.46 + Stop Campus Hazing Act). */
export const DISCLOSURES: DisclosureDef[] = [
  {
    key: "crimeReporting",
    label: "Policies for reporting crimes & emergencies",
    hint: "How to report crimes and emergencies; campus security authorities; voluntary confidential reporting.",
  },
  {
    key: "lawEnforcement",
    label: "Campus law enforcement authority & jurisdiction",
    hint: "Authority of campus police/security and the working relationship with local law enforcement agencies.",
  },
  {
    key: "securityAccess",
    label: "Security of & access to campus facilities",
    hint: "Residential access controls and security considerations in campus maintenance.",
  },
  {
    key: "timelyWarning",
    label: "Timely warning procedures",
    hint: "How the institution issues timely warnings for Clery-reportable crimes that pose an ongoing threat.",
  },
  {
    key: "emergencyNotification",
    label: "Emergency notification procedures",
    hint: "Immediate notification upon confirmation of a significant emergency or dangerous situation.",
  },
  {
    key: "emergencyResponse",
    label: "Emergency response & evacuation procedures",
    hint: "Emergency response procedures and annual testing of evacuation plans.",
  },
  {
    key: "missingStudent",
    label: "Missing student notification policy",
    hint: "Required for institutions that maintain on-campus student housing.",
  },
  {
    key: "vawaPolicies",
    label: "Sexual assault / VAWA policies & procedures",
    hint: "Prevention and awareness programs; disciplinary procedures for dating violence, domestic violence, sexual assault, and stalking.",
  },
  {
    key: "alcoholDrugs",
    label: "Alcohol & drug policies",
    hint: "Drug-Free Schools and Communities Act statement of standards and sanctions.",
  },
  {
    key: "fireSafety",
    label: "Fire safety policies (on-campus housing)",
    hint: "Fire safety systems, drills, evacuation procedures, and published fire statistics.",
  },
  {
    key: "crimeLog",
    label: "Daily crime log",
    hint: "Public log of crimes reported to campus police or security.",
  },
  {
    key: "fireLog",
    label: "Fire log (on-campus housing)",
    hint: "Public log of fires in on-campus student housing facilities.",
  },
  {
    key: "hazingPolicy",
    label: "Hazing policy (Stop Campus Hazing Act)",
    hint: "Hazing prevention, reporting, and transparency requirements.",
    requiredFromYear: 2026,
  },
];

/** Statistics window for an ASR of report year Y: [Y-3, Y-2, Y-1]. */
export function statsWindow(reportYear: number): [number, number, number] {
  return [reportYear - 3, reportYear - 2, reportYear - 1];
}

/** True when a disclosure statement is required for the given report year. */
export function disclosureRequired(def: DisclosureDef, reportYear: number): boolean {
  return !def.requiredFromYear || def.requiredFromYear <= reportYear;
}

/**
 * Legacy disclosure keys written by an early seed whose key set
 * predates the current DISCLOSURES defs. A record carrying them
 * renders every checkbox unchecked with empty notes, and toggles
 * map by current key so nothing ever changes — the editor looks
 * dead (found live by James, 2026-10-13; the seeded Sample
 * University ASR was the carrier). Only seeded demo records ever
 * held legacy keys; app-created ASRs always used the current set.
 */
export const LEGACY_DISCLOSURE_ALIASES: Record<string, string> = {
  "facility-security": "securityAccess",
  "law-enforcement": "lawEnforcement",
  "timely-warning": "timelyWarning",
  "emergency-response": "emergencyResponse",
  "missing-student": "missingStudent",
  "drug-alcohol": "alcoholDrugs",
  "vawa-programs": "vawaPolicies",
  "emergency-notification": "emergencyNotification",
  hazing: "hazingPolicy",
};

/**
 * The report's disclosures merged onto the current DISCLOSURES
 * defs: exactly one row per def — the stored row with the def's
 * key, else the row stored under a legacy alias (note + complete
 * preserved). Stored rows with no current counterpart are dropped.
 * Pure; callers decide whether to persist the healed rows.
 */
export function mergedDisclosures(report: CleryReport): CleryDisclosure[] {
  const byKey = new Map(report.disclosures.map((d) => [d.key, d]));
  return DISCLOSURES.map((def) => {
    const direct = byKey.get(def.key);
    if (direct) {
      return { ...direct, label: def.label, requiredFromYear: def.requiredFromYear };
    }
    for (const [legacy, current] of Object.entries(LEGACY_DISCLOSURE_ALIASES)) {
      if (current !== def.key) continue;
      const aliased = byKey.get(legacy);
      if (aliased) {
        return {
          ...aliased,
          key: def.key,
          label: def.label,
          requiredFromYear: def.requiredFromYear,
        };
      }
    }
    return {
      key: def.key,
      label: def.label,
      complete: false,
      note: "",
      requiredFromYear: def.requiredFromYear,
    };
  });
}

/** Heal a stored report's disclosures in place; true when they changed. */
export function healDisclosures(report: CleryReport): boolean {
  const merged = mergedDisclosures(report);
  const changed = JSON.stringify(merged) !== JSON.stringify(report.disclosures);
  if (changed) report.disclosures = merged;
  return changed;
}

export function blankCleryReport(
  institution: string,
  reportYear: number,
  preparerName = "",
  preparerTitle = ""
): CleryReport {
  const now = nowIso();
  const id = uid("clery");
  const years = statsWindow(reportYear);
  const stats: CleryStatRow[] = [];
  OFFENSE_GROUPS.forEach((group) => {
    group.offenses.forEach((offense) => {
      years.forEach((year) => {
        GEOS.forEach((geo) => {
          stats.push({
            id: uid("clsty"),
            reportId: id,
            year,
            group: group.label,
            offense: offense.label,
            geo: geo.key,
            value: null,
            confirmedZero: false,
          });
        });
      });
    });
  });
  const disclosures: CleryDisclosure[] = DISCLOSURES.map((d) => ({
    key: d.key,
    label: d.label,
    complete: false,
    note: "",
    requiredFromYear: d.requiredFromYear,
  }));
  return {
    id,
    institution,
    reportYear,
    preparerName,
    preparerTitle,
    stats,
    disclosures,
    createdAt: now,
    updatedAt: now,
  };
}

/** Stats completeness: cells with any entered value (incl. confirmed zeros) vs total cells. */
export function statsProgress(report: CleryReport): { entered: number; total: number } {
  const total = report.stats.length;
  const entered = report.stats.filter((s) => s.value !== null).length;
  return { entered, total };
}

/** Disclosure completeness against statements required for this report year. */
export function disclosureProgress(report: CleryReport): { complete: number; required: number } {
  const rows = mergedDisclosures(report);
  const relevant = rows.filter((d) => {
    const def = DISCLOSURES.find((x) => x.key === d.key);
    return def ? disclosureRequired(def, report.reportYear) : true;
  });
  return {
    complete: relevant.filter((d) => d.complete).length,
    required: relevant.length,
  };
}

function cellText(row: CleryStatRow): string {
  if (row.value === null) return "—";
  return String(row.value);
}

function mdEscape(s: string): string {
  return s.replace(/\|/g, "\\|");
}

/**
 * Build one complete markdown document for the ASR: cover header, one
 * statistics table per year (each table covers all groups × geographies),
 * then the required policy disclosure checklist and preparer sign-off.
 */
export function generateAsrMarkdown(report: CleryReport): string {
  const [y1, , y3] = statsWindow(report.reportYear);
  const lines: string[] = [];
  lines.push(`# Annual Security Report — ${report.institution}`);
  lines.push("");
  lines.push(`**Report year:** ${report.reportYear} (statistics cover ${y1}–${y3})`);
  if (report.preparerName) {
    lines.push(
      `**Prepared by:** ${report.preparerName}${report.preparerTitle ? ` — ${report.preparerTitle}` : ""}`
    );
  }
  lines.push("");
  lines.push(
    "> Legend: **—** = not entered. **0** = confirmed zero (the institution verified there were no incidents)."
  );
  lines.push("");

  statsWindow(report.reportYear).forEach((year) => {
    lines.push(`## Crime statistics — ${year}`);
    lines.push("");
    lines.push(
      `| Offense | ${GEOS.map((g) => g.label).join(" | ")} |`
    );
    lines.push("| --- | --- | --- | --- | --- |");
    OFFENSE_GROUPS.forEach((group) => {
      lines.push(`| **${group.label}** |  |  |  |  |`);
      group.offenses.forEach((offense) => {
        const cells = GEOS.map((geo) => {
          const row = report.stats.find(
            (s) => s.year === year && s.group === group.label && s.offense === offense.label && s.geo === geo.key
          );
          return row ? cellText(row) : "—";
        });
        lines.push(`| ${mdEscape(offense.label)} | ${cells.join(" | ")} |`);
      });
    });
    lines.push("");
  });

  lines.push("## Required policy disclosure statements");
  lines.push("");
  const byKey = new Map(DISCLOSURES.map((d) => [d.key, d]));
  report.disclosures.forEach((d) => {
    const def = byKey.get(d.key);
    const required = def ? disclosureRequired(def, report.reportYear) : true;
    if (!required) return;
    const box = d.complete ? "[x]" : "[ ]";
    const note = d.note.trim() ? ` — ${d.note.trim()}` : "";
    lines.push(`- ${box} **${d.label}**${note}`);
  });
  lines.push("");
  lines.push(
    `*Report generated ${new Date().toISOString().slice(0, 10)}. Fictional demo data — not a filed report.*`
  );
  return lines.join("\n");
}
