/**
 * Shared UI primitives. Mobile-first; interactive elements are >=44px.
 * Use these (instead of inventing new styles) for visual consistency.
 */
"use client";

import React from "react";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_12px_32px_-16px_rgba(109,40,217,0.18)] md:p-5 ${className}`}
    >
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

type BtnVariant = "primary" | "ghost" | "danger";

export function Btn({
  children,
  variant = "primary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
}) {
  const styles: Record<BtnVariant, string> = {
    primary: "btn-brand font-semibold",
    ghost:
      "border border-slate-300 bg-white text-slate-700 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50/50 font-medium",
    danger:
      "border border-red-300 bg-white text-red-700 hover:bg-red-50 font-medium",
  };
  return (
    <button
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm transition-colors disabled:opacity-50 ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

const TONES: Record<string, string> = {
  gray: "bg-slate-100 text-slate-700",
  blue: "bg-blue-100 text-blue-800",
  violet: "bg-violet-100 text-violet-800",
  indigo: "bg-indigo-100 text-indigo-800",
  green: "bg-emerald-100 text-emerald-800",
  yellow: "bg-amber-100 text-amber-800",
  red: "bg-rose-100 text-rose-800",
  cyan: "bg-cyan-100 text-cyan-800",
};

export function Badge({
  tone = "gray",
  children,
}: {
  tone?: keyof typeof TONES;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function RiskBadge({ risk }: { risk: string | null }) {
  if (!risk) return <Badge tone="gray">Unrated</Badge>;
  const tone = risk === "high" ? "red" : risk === "moderate" ? "yellow" : "green";
  return <Badge tone={tone}>{risk.charAt(0).toUpperCase() + risk.slice(1)}</Badge>;
}

export function StatusPill({ status }: { status: string }) {
  const tone =
    status === "completed"
      ? "green"
      : status === "in_progress"
        ? "violet"
        : status === "cancelled" || status === "declined"
          ? "gray"
          : status === "scheduled"
            ? "cyan"
            : "yellow";
  const label = status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return <Badge tone={tone as keyof typeof TONES}>{label}</Badge>;
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-100";

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-violet-300 bg-gradient-to-b from-violet-50/60 to-white p-8 text-center">
      <p className="font-semibold text-slate-800">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Simple modal. Render conditionally; closes on backdrop click. */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl md:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * In-app confirmation for destructive actions. NEVER use
 * window.confirm(): the native dialog blocks the page's JS thread,
 * behaves inconsistently in standalone/PWA mode, and can't be
 * exercised by automated end-to-end checks (three audit runs froze
 * on it, 2026-10-13).
 */
export function ConfirmModal({
  title,
  body,
  confirmLabel = "Confirm",
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-slate-600">{body}</p>
      <div className="mt-5 flex gap-2">
        <Btn variant="ghost" className="flex-1" onClick={onClose}>
          Cancel
        </Btn>
        <Btn
          variant={danger ? "danger" : "primary"}
          className="flex-1"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </Btn>
      </div>
    </Modal>
  );
}
