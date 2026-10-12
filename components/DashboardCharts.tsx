/**
 * Dashboard charts — pure SVG, no dependencies, print-friendly.
 * Theme-matched: violet/indigo accents, semantic risk colors.
 */
"use client";

import Link from "next/link";

const RISK_META = [
  { key: "high", label: "High", color: "#f43f5e" },
  { key: "moderate", label: "Moderate", color: "#f59e0b" },
  { key: "low", label: "Low", color: "#10b981" },
] as const;

export function FindingsRiskChart({
  counts,
}: {
  counts: Record<string, number>;
}) {
  const max = Math.max(1, ...RISK_META.map((r) => counts[r.key] ?? 0));
  const total = RISK_META.reduce((n, r) => n + (counts[r.key] ?? 0), 0);
  return (
    <div>
      <div className="space-y-3">
        {RISK_META.map((r) => {
          const v = counts[r.key] ?? 0;
          const pct = Math.round((v / max) * 100);
          return (
            <Link
              key={r.key}
              href={`/findings?risk=${r.key}`}
              className="block rounded-lg transition-colors hover:bg-violet-50/50"
            >
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">{r.label}</span>
                <span className="font-bold text-slate-900">{v}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: r.color }}
                />
              </div>
            </Link>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-400">
        {total} finding{total === 1 ? "" : "s"} across all assessments
      </p>
    </div>
  );
}

const STATUS_META = [
  { key: "draft", label: "Draft", color: "#94a3b8" },
  { key: "in_progress", label: "In progress", color: "#8b5cf6" },
  { key: "completed", label: "Completed", color: "#10b981" },
] as const;

export function AssessmentStatusDonut({
  counts,
}: {
  counts: Record<string, number>;
}) {
  const total = STATUS_META.reduce((n, s) => n + (counts[s.key] ?? 0), 0);
  const R = 54;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const segs = STATUS_META.map((s) => {
    const v = counts[s.key] ?? 0;
    const frac = total > 0 ? v / total : 0;
    const seg = { ...s, value: v, dash: frac * C, offset };
    offset += frac * C;
    return seg;
  });
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0">
        <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Assessments by status">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#f1f5f9" strokeWidth="18" />
          {segs.map((s) =>
            s.dash > 0 ? (
              <circle
                key={s.key}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth="18"
                strokeDasharray={`${s.dash} ${C - s.dash}`}
                strokeDashoffset={-s.offset}
                strokeLinecap="butt"
                transform="rotate(-90 70 70)"
              />
            ) : null
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-slate-900">{total}</span>
          <span className="text-[11px] text-slate-400">total</span>
        </div>
      </div>
      <div className="space-y-2.5">
        {segs.map((s) => (
          <Link
            key={s.key}
            href={`/assessments?status=${s.key}`}
            className="flex items-center gap-2 rounded-lg text-sm transition-colors hover:bg-violet-50/50"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: s.color }}
            />
            <span className="text-slate-600">{s.label}</span>
            <span className="ml-auto pl-4 font-bold text-slate-900">{s.value}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
