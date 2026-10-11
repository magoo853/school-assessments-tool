"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getMode, useMode, onModeChange } from "@/lib/mode";
import { ensureSeed, clearAllData } from "@/lib/store";
import { installSeed } from "@/lib/seed";

const NAV = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/assessments", label: "Assessments", icon: "📋" },
  { href: "/schedule", label: "Schedule", icon: "🗓️" },
  { href: "/assessors", label: "Assessors", icon: "👥" },
  { href: "/reports", label: "Reports & Exports", icon: "📄" },
  { href: "/policies", label: "Policy Docs", icon: "📚" },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-1 px-3 py-4">
      {NAV.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "bg-brand-active"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <span className="text-lg" aria-hidden>
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mode, setMode] = useMode();

  // Seed wiring: demo mode installs fictional seed data once; switching to
  // prod wipes everything; switching back to demo re-seeds.
  useEffect(() => {
    if (getMode() === "demo") ensureSeed(installSeed);
    return onModeChange((m) => {
      if (m === "prod") clearAllData();
      else ensureSeed(installSeed);
    });
  }, []);
  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-gray-200 bg-white md:block">
        <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-4">
          <span className="text-2xl" aria-hidden>
            🛡️
          </span>
          <div>
            <p className="text-sm font-bold leading-tight">School Assessments</p>
            <p className="text-xs text-gray-500 leading-tight">Assessor Tool</p>
          </div>
        </div>
        <NavLinks />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-gray-200 px-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl" aria-hidden>
                  🛡️
                </span>
                <p className="text-sm font-bold">School Assessments</p>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <NavLinks onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="md:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-gray-200 bg-white/95 px-4 backdrop-blur">
          <button
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 md:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>
          <p className="text-sm font-semibold text-gray-800">
            School Assessments Tool
          </p>
          {/* Demo / Prod segmented control */}
          <div className="ml-auto">
            <div
              role="group"
              aria-label="Demo or prod mode"
              className="flex rounded-lg border border-gray-300 bg-gray-100 p-1"
            >
              {(["demo", "prod"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`flex min-h-[44px] items-center justify-center rounded-md px-4 text-sm font-semibold transition-colors ${
                    mode === m
                      ? "bg-white text-gray-900 shadow"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {m === "demo" ? "DEMO" : "PROD"}
                </button>
              ))}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
