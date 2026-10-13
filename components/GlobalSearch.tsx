"use client";

/**
 * Header global search — one box that jumps to clients, assessments,
 * findings, and reports by text (lib/search does the matching).
 *
 * Behaviour: type ≥2 characters → grouped dropdown (best matches
 * first). ↑/↓ move, Enter opens the highlighted result, Esc closes,
 * clicking a result navigates and clears the box. Data is read fresh
 * from the local store on each keystroke, so results always reflect
 * what's on this device right now.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { db } from "@/lib/store";
import { searchAll, type SearchKind, type SearchResult } from "@/lib/search";

const KIND_META: Record<SearchKind, { icon: string; label: string }> = {
  client: { icon: "🏫", label: "Clients" },
  assessment: { icon: "📋", label: "Assessments" },
  finding: { icon: "🔍", label: "Findings" },
  report: { icon: "📄", label: "Reports" },
};

const KIND_ORDER: SearchKind[] = ["client", "assessment", "finding", "report"];

export default function GlobalSearch({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim();
  const results: SearchResult[] = useMemo(() => {
    if (!open || trimmed.length < 2) return [];
    return searchAll(
      {
        assessments: db.assessments.list(),
        findings: db.findings.list(),
        reports: db.reports.list(),
        schedules: db.schedules.list(),
      },
      query,
      12
    );
    // db reads are fresh per render; `open`/`query` drive re-computation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, pathname]);

  // Grouped view, preserving the global best-first order inside groups.
  const groups = useMemo(
    () =>
      KIND_ORDER.map((kind) => ({
        kind,
        items: results.filter((r) => r.kind === kind),
      })).filter((g) => g.items.length > 0),
    [results]
  );
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // Navigating anywhere (incl. picking a result) resets the box.
  useEffect(() => {
    setQuery("");
    setOpen(false);
  }, [pathname]);

  // Click outside closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open ]);

  const go = (r: SearchResult) => {
    setOpen(false);
    setQuery("");
    onNavigate?.();
    router.push(r.href);
  };

  const showDropdown = open && trimmed.length >= 2;

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400"
      >
        🔍
      </span>
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => (flat.length ? (a + 1) % flat.length : 0));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) =>
              flat.length ? (a - 1 + flat.length) % flat.length : 0
            );
          } else if (e.key === "Enter") {
            const target = flat[active] ?? flat[0];
            if (showDropdown && target) {
              e.preventDefault();
              go(target);
            }
          }
        }}
        placeholder="Search clients, findings, assessments, reports…"
        aria-label="Search clients, findings, assessments, and reports"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls="global-search-results"
        aria-activedescendant={
          showDropdown && flat[active] ? `gs-${flat[active].key}` : undefined
        }
        className="min-h-[44px] w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
      />
      {showDropdown && (
        <div
          id="global-search-results"
          role="listbox"
          aria-label="Search results"
          className="absolute inset-x-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#141d33] p-2 shadow-2xl"
        >
          {flat.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-400">
              No matches for “{trimmed}” — try a client name, a finding
              keyword, or a report title.
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.kind} className="mb-1 last:mb-0">
                <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  {KIND_META[g.kind].label}
                </p>
                <ul>
                  {g.items.map((r) => {
                    const idx = flat.indexOf(r);
                    const isActive = idx === active;
                    return (
                      <li key={r.key} role="option" id={`gs-${r.key}`} aria-selected={isActive}>
                        <Link
                          href={r.href}
                          onClick={() => {
                            setOpen(false);
                            setQuery("");
                            onNavigate?.();
                          }}
                          onMouseEnter={() => setActive(idx)}
                          className={`flex min-h-[44px] items-start gap-2.5 rounded-xl px-3 py-2 ${
                            isActive ? "bg-white/10" : ""
                          }`}
                        >
                          <span aria-hidden className="pt-0.5 text-base">
                            {KIND_META[r.kind].icon}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-white">
                              {r.title}
                            </span>
                            <span className="block truncate text-xs text-slate-400">
                              {r.subtitle}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
