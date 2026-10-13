/**
 * Shown in PROD mode: this is the real workspace. Data lives on this
 * device (PROD has its own dataset, separate from DEMO); shared cloud
 * storage arrives with the Supabase phase.
 */
"use client";

export default function ProdNotice() {
  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">PROD mode — your real workspace</p>
      <p className="mt-1 text-sm text-amber-800">
        Everything you enter here is stored on this device only, in PROD's
        own dataset — DEMO keeps its separate sample data, and switching
        modes never deletes anything. Shared cloud storage arrives with
        the Supabase phase; until then, back up regularly from Reports
        &amp; Exports.
      </p>
    </div>
  );
}
