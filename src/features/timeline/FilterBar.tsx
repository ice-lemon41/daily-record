import { formatFullDay } from "../../domain/dates";
import type { EntryFilter } from "../filter";

interface FilterBarProps {
  filter: EntryFilter;
  onBackfill?: () => void;
  onClose: () => void;
}

export function filterLabel(filter: EntryFilter): string {
  if (filter.kind === "day") return formatFullDay(filter.dayStart);
  if (filter.kind === "tag") return `#${filter.name}`;
  return `搜索「${filter.keyword}」`;
}

/** 顶部筛选 chip：按天时额外提供「在这天补记」（PRD FR-06-3 / FR-07-4）。 */
export function FilterBar({ filter, onBackfill, onClose }: FilterBarProps) {
  return (
    <div className="flex items-center gap-2 px-4 pb-2">
      <span className="inline-flex min-h-9 items-center gap-1 rounded-full bg-neutral-100 py-1 pl-3 pr-1 text-xs text-neutral-700">
        <span aria-label="当前筛选">{filterLabel(filter)}</span>
        <button
          type="button"
          aria-label="关闭筛选"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-200"
        >
          ×
        </button>
      </span>

      {filter.kind === "day" && onBackfill ? (
        <button
          type="button"
          onClick={onBackfill}
          className="min-h-9 rounded-full border border-emerald-200 px-3 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
        >
          在这天补记
        </button>
      ) : null}
    </div>
  );
}
