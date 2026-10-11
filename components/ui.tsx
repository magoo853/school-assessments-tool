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
      className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:p-5 ${className}`}
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
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
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
    ghost: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 font-medium",
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
  gray: "bg-gray-100 text-gray-700",
  blue: "bg-blue-100 text-blue-800",
  green: "bg-green-100 text-green-800",
  yellow: "bg-yellow-100 text-yellow-800",
  red: "bg-red-100 text-red-800",
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
        ? "blue"
        : status === "cancelled" || status === "declined"
          ? "gray"
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
  "w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-gray-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

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
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
      <p className="font-semibold text-gray-800">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">{body}</p>}
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
}) {
  return (
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
