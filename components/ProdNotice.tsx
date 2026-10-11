/**
 * Shown in PROD mode: no live database is connected yet.
 */
"use client";

export default function ProdNotice() {
  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">PROD mode — live database not connected</p>
      <p className="mt-1 text-sm text-amber-800">
        Supabase is not wired up yet, so tables are empty. Switch back to DEMO
        in the header to work with the fictional sample data.
      </p>
    </div>
  );
}
