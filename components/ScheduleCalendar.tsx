/**
 * Month calendar for the schedule board — the dispatch-board calendar view,
 * mirroring the Code Red Hub's DispatchCalendar.
 *
 * Schedule items land on their date; color shows status. Tapping a day
 * lists that day's visits below the grid.
 */
"use client";

import { useMemo, useState } from "react";
import type { ScheduleItem, ScheduleStatus } from "@/lib/store";
import { Card, StatusPill } from "@/components/ui";
import { AssessorCompact, AssessorUnassigned } from "@/components/AssessorCard";
import { db } from "@/lib/store";

const STATUS_TONE: Record<ScheduleStatus, string> = {
  scheduled: "bg-violet-500",
  in_progress: "bg-amber-500",
  completed: "bg-green-500",
  cancelled: "bg-gray-300",
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function monthLabel(y: number, m: number): string {
  return new Date(y, m, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function todayKey(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate()
  ).padStart(2, "0")}`;
}

function keyOf(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default function ScheduleCalendar({ items }: { items: ScheduleItem[] }) {
  const now = new Date();
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selected, setSelected] = useState<string | null>(todayKey());

  const byDate = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    for (const item of items) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    return map;
  }, [items]);

  const firstDow = new Date(month.y, month.m, 1).getDay();
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => keyOf(month.y, month.m, i + 1)),
  ];

  const selectedItems = selected ? (byDate.get(selected) ?? []) : [];
  const today = todayKey();

  const shift = (dir: 1 | -1) =>
    setMonth(({ y, m }) => {
      const nm = m + dir;
      return nm < 0
        ? { y: y - 1, m: 11 }
        : nm > 11
          ? { y: y + 1, m: 0 }
          : { y, m: nm };
    });

  return (
    <Card className="p-0 md:p-0">
      <div className="flex items-center justify-between px-4 pt-4 md:px-5">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Previous month"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          ‹
        </button>
        <h2 className="text-lg font-bold tracking-tight text-slate-900">{monthLabel(month.y, month.m)}</h2>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Next month"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          ›
        </button>
      </div>

      <div className="px-4 pb-4 pt-3 md:px-5">
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w, i) => (
            <div key={i} className="pb-1 text-xs font-semibold text-gray-400">
              {w}
            </div>
          ))}
          {cells.map((key, i) => {
            if (!key) return <div key={`e${i}`} />;
            const dayItems = byDate.get(key) ?? [];
            const isSelected = key === selected;
            const isToday = key === today;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                aria-label={`${key}, ${dayItems.length} visit(s)`}
                className={`flex min-h-[48px] flex-col items-center justify-start rounded-lg border pt-1.5 transition ${
                  isSelected
                    ? "border-violet-500 bg-violet-50"
                    : isToday
                      ? "border-gray-300 bg-white ring-1 ring-gray-300"
                      : "border-transparent bg-white hover:border-gray-200"
                }`}
              >
                <span
                  className={`text-sm ${isSelected ? "font-bold text-violet-800" : "text-gray-700"}`}
                >
                  {Number(key.slice(8))}
                </span>
                <span className="mt-1 flex flex-wrap items-center justify-center gap-0.5 px-1">
                  {dayItems.slice(0, 3).map((it) => (
                    <span
                      key={it.id}
                      className={`h-1.5 w-1.5 rounded-full ${STATUS_TONE[it.status]}`}
                    />
                  ))}
                  {dayItems.length > 3 && (
                    <span className="text-[9px] text-gray-400">+{dayItems.length - 3}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected day detail */}
        <div className="mt-4 border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-700">
            {selected
              ? new Date(
                  Number(selected.slice(0, 4)),
                  Number(selected.slice(5, 7)) - 1,
                  Number(selected.slice(8))
                ).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })
              : "Select a day"}
          </h3>
          {selectedItems.length === 0 ? (
            <p className="mt-2 text-sm text-gray-400">No visits scheduled.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {selectedItems.map((it) => {
                const assessor = it.assessorId
                  ? db.assessors.get(it.assessorId)
                  : undefined;
                return (
                  <li
                    key={it.id}
                    className="rounded-xl border border-gray-100 bg-gray-50 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-gray-900">{it.clientName}</p>
                      <StatusPill status={it.status} />
                    </div>
                    {it.campus && (
                      <p className="mt-0.5 text-xs text-gray-500">{it.campus}</p>
                    )}
                    <div className="mt-2">
                      {assessor ? (
                        <AssessorCompact assessor={assessor} />
                      ) : (
                        <AssessorUnassigned />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500">
          {(Object.keys(STATUS_TONE) as ScheduleStatus[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${STATUS_TONE[s]}`} />
              {s.replace("_", " ")}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}
