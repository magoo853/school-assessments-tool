/**
 * Shown in PROD mode: this is the real workspace. The data-loss
 * warning stays visible (stored on this device only — back it up);
 * how the modes keep their data apart sits behind the ⓘ.
 */
"use client";

import { InfoHint } from "./ui";

export default function ProdNotice() {
  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p className="flex items-center gap-1 text-sm font-semibold text-amber-900">
        PROD mode — your real workspace
        <InfoHint
          label="how PROD and DEMO data are kept"
          text="Data entered here is stored on this device only, in PROD's own dataset — DEMO keeps its separate sample data, and switching modes never deletes anything. Shared cloud storage arrives with the Supabase phase."
        />
      </p>
      <p className="mt-1 text-sm text-amber-800">
        Data is stored on this device only — back up regularly from
        Reports &amp; Exports.
      </p>
    </div>
  );
}
