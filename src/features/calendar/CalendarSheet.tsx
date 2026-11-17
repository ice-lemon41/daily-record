import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { Modal } from "../../components/Modal";
import type { AppDb } from "../../db/db";
import { listEntriesBetween } from "../../db/repositories/entries";
import {
  addLocalDays,
  addLocalMonths,
  calendarGrid,
  dateKey,
  startOfLocalDay,
  weekdayLabel,
} from "../../domain/dates";

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"] as const;

interface CalendarSheetProps {
  database: AppDb;
  now: number;
  selectedDay: number | null;
  onSelectDay: (ts: number) => void;
  onClose: () => void;
}

/** 月视图日历：打点、选天、切换月份（PRD FR-06）。 */
export function CalendarSheet({
  database,
  now,
  selectedDay,
  onSelectDay,
  onClose,
}: CalendarSheetProps) {
  const base = selectedDay ?? now;
  const initial = new Date(base);
  const [viewYear, setViewYear] = useState(() => initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(() => initial.getMonth() + 1);

  const cells = useMemo(() => calendarGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const rangeStart = startOfLocalDay(cells[0]?.ts ?? now);
  const rangeEnd = addLocalDays(startOfLocalDay(cells.at(-1)?.ts ?? now), 1);
  const entries = useLiveQuery(
    () => listEntriesBetween(database, rangeStart, rangeEnd),
    [database, rangeStart, rangeEnd],
  );

  const marked = useMemo(
    () => new Set((entries ?? []).map((entry) => dateKey(entry.occurredAt))),
    [entries],
  );
  const todayKey = dateKey(now);
  const selectedKey = selectedDay === null ? null : dateKey(selectedDay);

  function changeMonth(delta: number) {
    const next = addLocalMonths(viewYear, viewMonth, delta);
    setViewYear(next.year);
    setViewMonth(next.month);
  }

  function goToday() {
    const today = new Date(now);
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth() + 1);
  }

  return (
    <Modal open title="日历" onClose={onClose}>
      <div className="overflow-y-auto p-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="上个月"
            onClick={() => changeMonth(-1)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-lg text-neutral-600 hover:bg-neutral-100"
          >
            ‹
          </button>
          <h3 className="text-sm font-semibold text-neutral-900">
            {viewYear}年{viewMonth}月
          </h3>
          <button
            type="button"
            aria-label="下个月"
            onClick={() => changeMonth(1)}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-lg text-neutral-600 hover:bg-neutral-100"
          >
            ›
          </button>
        </div>

        <div className="mt-1 flex justify-center">
          <button
            type="button"
            onClick={goToday}
            className="min-h-9 rounded-full px-3 text-xs text-emerald-700 hover:bg-emerald-50"
          >
            回到今天
          </button>
        </div>

        <div className="mt-2 grid grid-cols-7 text-center text-xs text-neutral-400">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className="py-1">
              {label}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((cell) => {
            const hasEntry = marked.has(cell.dateKey);
            const isSelected = selectedKey === cell.dateKey;
            const isToday = todayKey === cell.dateKey;
            const date = new Date(cell.ts);

            return (
              <button
                key={cell.dateKey}
                type="button"
                aria-label={`${date.getMonth() + 1}月${date.getDate()}日 ${weekdayLabel(cell.ts)}${
                  hasEntry ? "，有记录" : ""
                }`}
                aria-current={isToday ? "date" : undefined}
                aria-pressed={isSelected}
                onClick={() => onSelectDay(startOfLocalDay(cell.ts))}
                className={`mx-auto flex h-11 w-11 flex-col items-center justify-center rounded-full text-sm ${
                  isSelected
                    ? "bg-neutral-900 text-white"
                    : cell.inMonth
                      ? "text-neutral-800 hover:bg-neutral-100"
                      : "text-neutral-300 hover:bg-neutral-50"
                }`}
              >
                <span>{cell.day}</span>
                <span
                  aria-hidden="true"
                  className={`mt-0.5 h-1 w-1 rounded-full ${
                    hasEntry ? (isSelected ? "bg-white" : "bg-emerald-500") : "bg-transparent"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
