"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getMode, useMode, onModeChange } from "@/lib/mode";
import { db, ensureSeed, clearAllData } from "@/lib/store";
import { installSeed } from "@/lib/seed";
import { useProfile, firstNameOf } from "@/lib/profile";
import { onSwUpdate, applySwUpdate } from "@/lib/swUpdate";

const NAV = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/assessments", label: "Assessments", icon: "📋" },
  { href: "/findings", label: "Findings", icon: "🔍" },
  { href: "/clients", label: "Clients", icon: "🏫" },
  { href: "/schedule", label: "Schedule", icon: "🗓️" },
  { href: "/assessors", label: "Assessors", icon: "👥" },
  { href: "/templates", label: "Templates", icon: "📝" },
  { href: "/reports", label: "Reports & Exports", icon: "📄" },
  { href: "/policies", label: "Policy Docs", icon: "📚" },
  { href: "/integrations", label: "Integrations", icon: "🔌" },
  { href: "/profile", label: "My Profile", icon: "👤" },
];

/** Profile chip in the header — avatar + first name, links to /profile. */
function ProfileChip() {
  const [profile] = useProfile();
  const photo = profile?.assessorId
    ? db.assessors.get(profile.assessorId)?.photo
    : undefined;
  if (!profile) {
    return (
      <Link
        href="/profile"
        className="flex min-h-[44px] items-center gap-2 rounded-xl px-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
      >
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-base"
        >
          👤
        </span>
        <span className="hidden lg:inline">Set up profile</span>
      </Link>
    );
  }
  const initials = profile.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <Link
      href="/profile"
      className="flex min-h-[44px] items-center gap-2 rounded-xl px-2 transition-colors hover:bg-white/10"
      aria-label={`My profile — ${profile.name}`}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt=""
          className="h-9 w-9 rounded-full border border-white/20 object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-xs font-bold text-white"
        >
          {initials}
        </span>
      )}
      <span className="hidden text-sm font-semibold text-white lg:inline">
        {firstNameOf(profile.name)}
      </span>
    </Link>
  );
}

/** Small "Offline" pill in the header when the device has no signal. */
function OfflineBadge() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);
  if (online) return null;
  return (
    <span className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 text-xs font-bold text-amber-300">
      <span aria-hidden>📡</span> Offline
    </span>
  );
}

/**
 * "New version available" banner — appears when a service-worker update
 * is waiting (see lib/swUpdate). Tapping Update activates the waiting
 * worker and the page reloads onto the fresh shell; Later dismisses for
 * this session only (the update is still offered on the next visit).
 */
function UpdateBanner() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => onSwUpdate(() => setShow(true)), []);
  if (!show || dismissed) return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-white/15 bg-[#141d33] p-3 shadow-2xl md:left-72 print:hidden"
    >
      <span aria-hidden className="text-xl">
        ✨
      </span>
      <p className="flex-1 text-sm font-medium text-white">
        New version available
        <span className="block text-xs font-normal text-slate-400">
          Update now to load the latest app — your data stays on this device.
        </span>
      </p>
      <button
        type="button"
        onClick={() => applySwUpdate()}
        className="flex min-h-[44px] items-center rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 text-sm font-bold text-white"
      >
        Update
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss update notice"
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}

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
            className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all ${
              active
                ? "bg-brand-active"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
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
      <UpdateBanner />
      {/* Desktop sidebar — dark chrome (hidden in print) */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-[#0B1120] md:flex print:hidden">
        <div className="chrome-glow flex h-20 items-center gap-3 border-b border-white/10 px-5">
          <span
            aria-hidden
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-indigo-500 to-cyan-400 text-xl shadow-[0_4px_16px_-4px_rgba(124,58,237,0.6)]"
          >
            🛡️
          </span>
          <div>
            <p className="text-sm font-bold leading-tight text-white">
              School <span className="text-gradient">Assessments</span>
            </p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400 leading-tight">
              Assessor Tool
            </p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks />
        </div>
        <div className="border-t border-white/10 px-5 py-4">
          <p className="text-[11px] leading-relaxed text-slate-500">
            Field-ready assessments,
            <br />
            built for assessors.
          </p>
        </div>
      </aside>

      {/* Mobile drawer (hidden in print) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden print:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-[#0B1120] shadow-2xl">
            <div className="chrome-glow flex h-20 items-center justify-between border-b border-white/10 px-4">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-indigo-500 to-cyan-400 text-xl"
                >
                  🛡️
                </span>
                <p className="text-sm font-bold text-white">
                  School <span className="text-gradient">Assessments</span>
                </p>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavLinks onNavigate={() => setDrawerOpen(false)} />
            </div>
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="md:pl-64 print:pl-0">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/10 bg-[#0B1120]/90 px-4 backdrop-blur-md print:hidden">
          <button
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white md:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>
          <p className="text-sm font-semibold text-white">
            School <span className="text-gradient">Assessments</span>{" "}
            <span className="font-normal text-slate-400">Tool</span>
          </p>
          <OfflineBadge />
          {/* Demo / Prod segmented control */}
          <div className="ml-auto">
            <div
              role="group"
              aria-label="Demo or prod mode"
              className="flex rounded-xl border border-white/10 bg-white/5 p-1"
            >
              {(["demo", "prod"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  className={`flex min-h-[44px] items-center justify-center rounded-lg px-4 text-xs font-bold tracking-[0.14em] transition-all ${
                    mode === m
                      ? "bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-[0_4px_14px_-4px_rgba(124,58,237,0.6)]"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {m === "demo" ? "DEMO" : "PROD"}
                </button>
              ))}
            </div>
          </div>
          <ProfileChip />
        </header>
        <main className="mx-auto max-w-6xl p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
