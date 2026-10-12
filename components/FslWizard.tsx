"use client";

/**
 * FSL determination — ISC RMP (2021), Section 4.
 *
 * Gated by a single checkbox at the top of the assessment: "This is a
 * federal facility". The determination section only appears when that
 * box is checked — the FSL sets the baseline Level of Protection the
 * federal assessment is measured against.
 */

import { useMemo, useState } from "react";
import { db, uid, nowIso, type FslRecord } from "@/lib/store";
import {
  computeFsl,
  fslLabel,
  populationPoints,
  sizePoints,
  FSL_QUALITATIVE,
  type FslPoints,
} from "@/lib/fsl";
import { Card, Btn, Field, inputCls, Badge } from "@/components/ui";

type QualKey = "mission" | "symbolism" | "threat";

const EMPTY_NOTES = { mission: "", symbolism: "", population: "", size: "", threat: "" };

function loadRecord(assessmentId: string): FslRecord | undefined {
  return db.fslRecords.filter((r) => r.assessmentId === assessmentId)[0];
}

function QualFactor({
  k,
  value,
  onChange,
  note,
  onNote,
}: {
  k: QualKey;
  value: FslPoints;
  onChange: (v: FslPoints) => void;
  note: string;
  onNote: (v: string) => void;
}) {
  const def = FSL_QUALITATIVE[k];
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="mb-2 text-sm font-semibold text-slate-800">{def.name}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {def.options.map((o) => (
          <button
            key={o.points}
            type="button"
            onClick={() => onChange(o.points)}
            className={`min-h-[44px] rounded-xl border px-2 py-2 text-left transition-colors ${
              value === o.points
                ? "border-violet-600 bg-violet-50 ring-2 ring-violet-100"
                : "border-slate-300 bg-white hover:bg-slate-50"
            }`}
            title={o.hint}
          >
            <span className="block text-sm font-semibold text-slate-800">
              {o.label} · {o.points}
            </span>
            <span className="block text-[11px] leading-tight text-slate-500">
              {o.hint}
            </span>
          </button>
        ))}
      </div>
      <input
        className={`${inputCls} mt-2`}
        placeholder={`Note — basis for the ${def.name.toLowerCase()} rating (optional)`}
        value={note}
        onChange={(e) => onNote(e.target.value)}
      />
    </div>
  );
}

export default function FslWizard({ assessmentId }: { assessmentId: string }) {
  const existing = useMemo(() => loadRecord(assessmentId), [assessmentId]);
  const [federal, setFederal] = useState(existing?.federalFacility ?? false);
  const [mission, setMission] = useState<FslPoints>(existing?.mission ?? 1);
  const [symbolism, setSymbolism] = useState<FslPoints>(existing?.symbolism ?? 1);
  const [threat, setThreat] = useState<FslPoints>(existing?.threat ?? 1);
  const [population, setPopulation] = useState<string>(
    existing?.populationCount != null ? String(existing.populationCount) : ""
  );
  const [size, setSize] = useState<string>(
    existing?.sizeSqft != null ? String(existing.sizeSqft) : ""
  );
  const [landBonus, setLandBonus] = useState(existing?.symbolismLandBonus ?? false);
  const [landRationale, setLandRationale] = useState(
    existing?.symbolismLandRationale ?? ""
  );
  const [notes, setNotes] = useState(existing?.factorNotes ?? EMPTY_NOTES);
  const [adj, setAdj] = useState<-1 | 0 | 1>(existing?.intangibleAdj ?? 0);
  const [adjJust, setAdjJust] = useState(existing?.intangibleJustification ?? "");
  const [assessedBy, setAssessedBy] = useState(existing?.assessedBy ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<FslRecord | undefined>(existing);

  const popNum = population.trim() === "" ? null : Number(population);
  const sizeNum = size.trim() === "" ? null : Number(size);

  const result = useMemo(
    () =>
      computeFsl({
        mission,
        symbolism,
        threat,
        populationCount:
          popNum != null && Number.isFinite(popNum) && popNum >= 0 ? popNum : null,
        sizeSqft:
          sizeNum != null && Number.isFinite(sizeNum) && sizeNum >= 0 ? sizeNum : null,
        symbolismLandBonus: landBonus,
        intangibleAdj: adj,
      }),
    [mission, symbolism, threat, popNum, sizeNum, landBonus, adj]
  );

  const save = () => {
    setError(null);
    if (popNum == null || !Number.isFinite(popNum) || popNum < 0) {
      setError("Enter the facility population (headcount) to complete the determination.");
      return;
    }
    if (sizeNum == null || !Number.isFinite(sizeNum) || sizeNum < 0) {
      setError("Enter the facility size (square feet) to complete the determination.");
      return;
    }
    if (landBonus && !landRationale.trim()) {
      setError(
        "The standard requires documenting the rationale when the land-area symbolism bonus is applied."
      );
      return;
    }
    if (adj !== 0 && !adjJust.trim()) {
      setError(
        "An intangible adjustment requires a documented justification (ISC RMP §4.3)."
      );
      return;
    }
    const r = computeFsl({
      mission,
      symbolism,
      threat,
      populationCount: popNum,
      sizeSqft: sizeNum,
      symbolismLandBonus: landBonus,
      intangibleAdj: adj,
    });
    if (!r) {
      setError("Could not compute the FSL — check the numeric inputs.");
      return;
    }
    const rec: FslRecord = {
      id: existing?.id ?? uid("fsl"),
      assessmentId,
      federalFacility: federal,
      mission,
      symbolism,
      threat,
      populationCount: popNum,
      sizeSqft: sizeNum,
      symbolismLandBonus: landBonus,
      symbolismLandRationale: landRationale.trim(),
      factorNotes: notes,
      intangibleAdj: adj,
      intangibleJustification: adjJust.trim(),
      total: r.total,
      preliminary: r.preliminary,
      final: r.final,
      assessedBy: assessedBy.trim(),
      assessedAt: existing?.assessedAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    db.fslRecords.upsert(rec);
    setSaved(rec);
  };

  const setNote = (k: keyof typeof notes, v: string) =>
    setNotes((n) => ({ ...n, [k]: v }));

  return (
    <Card className="mb-4 border-violet-200">
      {/* The gate: the FSL section only exists for federal facilities. */}
      <div className="flex min-h-[44px] flex-wrap items-center gap-3">
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
          <input
            type="checkbox"
            className="h-5 w-5 accent-violet-600"
            checked={federal}
            onChange={(e) => setFederal(e.target.checked)}
          />
          This is a federal facility
        </label>
        {federal && saved ? (
          <span className="ml-auto">
            <Badge tone="violet">{fslLabel(saved.final, saved.federalFacility)}</Badge>
          </span>
        ) : saved ? (
          <span className="ml-auto text-xs text-slate-400">
            FSL determination on file — check the box to view or edit
          </span>
        ) : null}
      </div>

      {federal && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <div>
            <p className="text-sm font-bold text-slate-800">
              Facility Security Level determination
            </p>
            <p className="text-xs text-slate-500">
              ISC RMP (2021) §4 · Sets the baseline Level of Protection for this assessment
            </p>
          </div>

          <QualFactor
            k="mission"
            value={mission}
            onChange={setMission}
            note={notes.mission}
            onNote={(v) => setNote("mission", v)}
          />
          <QualFactor
            k="symbolism"
            value={symbolism}
            onChange={setSymbolism}
            note={notes.symbolism}
            onNote={(v) => setNote("symbolism", v)}
          />

          <div className="rounded-xl border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-800">
              Symbolism — land-area rule
            </p>
            <label className="flex min-h-[44px] cursor-pointer items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-violet-600"
                checked={landBonus}
                onChange={(e) => setLandBonus(e.target.checked)}
              />
              <span>
                Large land area significantly contributes to target attractiveness
                <span className="block text-xs text-slate-500">
                  ISC §4.4.2: +1 symbolism point, max 4, rationale must be documented
                </span>
              </span>
            </label>
            {landBonus && (
              <input
                className={`${inputCls} mt-2`}
                placeholder="Rationale for the land-area bonus (required)"
                value={landRationale}
                onChange={(e) => setLandRationale(e.target.value)}
              />
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-3">
              <Field
                label="Facility population (headcount)"
                hint={
                  popNum != null && Number.isFinite(popNum) && popNum >= 0
                    ? `Maps to ${populationPoints(popNum)} pt — <100: 1 · 101–250: 2 · 251–750: 3 · >750: 4`
                    : "Bands: <100: 1 · 101–250: 2 · 251–750: 3 · >750: 4"
                }
              >
                <input
                  className={inputCls}
                  inputMode="numeric"
                  placeholder="e.g. 850"
                  value={population}
                  onChange={(e) => setPopulation(e.target.value)}
                />
              </Field>
              <input
                className={`${inputCls} mt-2`}
                placeholder="Note — basis for the population figure (optional)"
                value={notes.population}
                onChange={(e) => setNote("population", e.target.value)}
              />
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <Field
                label="Facility size (square feet)"
                hint={
                  sizeNum != null && Number.isFinite(sizeNum) && sizeNum >= 0
                    ? `Maps to ${sizePoints(sizeNum)} pt — <10k: 1 · 10–100k: 2 · 100–250k: 3 · >250k: 4`
                    : "Bands: <10k: 1 · 10–100k: 2 · 100–250k: 3 · >250k: 4"
                }
              >
                <input
                  className={inputCls}
                  inputMode="numeric"
                  placeholder="e.g. 120000"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                />
              </Field>
              <input
                className={`${inputCls} mt-2`}
                placeholder="Note — basis for the size figure (optional)"
                value={notes.size}
                onChange={(e) => setNote("size", e.target.value)}
              />
            </div>
          </div>

          <QualFactor
            k="threat"
            value={threat}
            onChange={setThreat}
            note={notes.threat}
            onNote={(v) => setNote("threat", v)}
          />

          <div className="rounded-xl border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-800">
              Intangible adjustment <span className="font-normal text-slate-500">(±1 FSL)</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {([-1, 0, 1] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAdj(v)}
                  className={`min-h-[44px] rounded-xl border px-2 py-2 text-sm font-semibold ${
                    adj === v
                      ? "border-violet-600 bg-violet-50 text-violet-800 ring-2 ring-violet-100"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {v === 0 ? "None" : v > 0 ? "+1 level" : "−1 level"}
                </button>
              ))}
            </div>
            {adj !== 0 && (
              <input
                className={`${inputCls} mt-2`}
                placeholder="Justification for the intangible adjustment (required)"
                value={adjJust}
                onChange={(e) => setAdjJust(e.target.value)}
              />
            )}
          </div>

          <Field label="Assessed by (optional)">
            <input
              className={inputCls}
              placeholder="Assessor name"
              value={assessedBy}
              onChange={(e) => setAssessedBy(e.target.value)}
            />
          </Field>

          {/* Live result */}
          <div className="rounded-xl bg-slate-900 p-4 text-white">
            {result ? (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span>
                  <span className="text-slate-400">Mission</span>{" "}
                  <strong>{result.scores.mission}</strong>
                </span>
                <span>
                  <span className="text-slate-400">Symbolism</span>{" "}
                  <strong>{result.scores.symbolism}</strong>
                </span>
                <span>
                  <span className="text-slate-400">Population</span>{" "}
                  <strong>{result.scores.population}</strong>
                </span>
                <span>
                  <span className="text-slate-400">Size</span>{" "}
                  <strong>{result.scores.size}</strong>
                </span>
                <span>
                  <span className="text-slate-400">Threat</span>{" "}
                  <strong>{result.scores.threat}</strong>
                </span>
                <span className="ml-auto text-base">
                  <span className="text-slate-400">Total {result.total} → </span>
                  <strong className="text-violet-300">
                    {fslLabel(result.final, federal)}
                  </strong>
                  {result.final !== result.preliminary && (
                    <span className="text-xs text-slate-400">
                      {" "}
                      (preliminary {result.preliminary}, adjusted)
                    </span>
                  )}
                </span>
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                Enter facility population and size to compute the determination.
              </p>
            )}
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
          )}

          <Btn onClick={save} className="w-full sm:w-auto">
            {saved ? "Update FSL determination" : "Save FSL determination"}
          </Btn>
          <p className="text-xs text-slate-400">
            Bands: I 5–7 · II 8–12 · III 13–17 · IV 18–20. Level V facilities are
            designated separately per ISC RMP §4.5.
          </p>
        </div>
      )}
    </Card>
  );
}
