import { useRef, useState } from "react";
import { ToastProvider } from "./components/Toast";
import { type AppDb, db } from "./db/db";
import { combineLocalDateTime, dateKey, formatClock } from "./domain/dates";
import { CalendarSheet } from "./features/calendar/CalendarSheet";
import { type BackfillRequest, Composer } from "./features/composer/Composer";
import type { EntryFilter } from "./features/filter";
import { SearchBar } from "./features/search/SearchBar";
import { FilterBar } from "./features/timeline/FilterBar";
import { Timeline } from "./features/timeline/Timeline";
import type { TagSelection } from "./features/timeline/TimelineEntry";
import { useNow } from "./hooks/use-now";

interface AppProps {
  /** 测试时注入独立数据库；运行期使用全局单例。 */
  database?: AppDb;
}

export default function App({ database = db }: AppProps) {
  const now = useNow();
  const [filter, setFilter] = useState<EntryFilter | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [backfillRequest, setBackfillRequest] = useState<BackfillRequest | null>(null);
  const backfillSeq = useRef(0);

  function openSearch() {
    // 搜索与按天 / 标签筛选互斥（PRD FR-07-3）。
    setFilter(null);
    setSearchOpen(true);
  }

  function closeSearch() {
    setSearchOpen(false);
    setFilter((current) => (current?.kind === "search" ? null : current));
  }

  function applyKeyword(keyword: string) {
    setFilter(keyword.trim().length > 0 ? { kind: "search", keyword: keyword.trim() } : null);
  }

  function selectTag(tag: TagSelection) {
    setSearchOpen(false);
    setFilter({ kind: "tag", name: tag.name, nameLower: tag.nameLower });
  }

  function selectDay(dayStart: number) {
    setCalendarOpen(false);
    setSearchOpen(false);
    setFilter((current) =>
      current?.kind === "day" && current.dayStart === dayStart ? null : { kind: "day", dayStart },
    );
  }

  function startBackfill() {
    if (filter?.kind !== "day") return;
    const occurredAt =
      combineLocalDateTime(dateKey(filter.dayStart), formatClock(now)) ?? filter.dayStart;
    backfillSeq.current += 1;
    setBackfillRequest({ id: backfillSeq.current, occurredAt });
  }

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-neutral-100">
        <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-white">
          <header className="flex items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-1">
            <h1
              className={`text-lg font-semibold tracking-tight text-neutral-900 ${
                searchOpen ? "sr-only" : ""
              }`}
            >
              日常记录
            </h1>
            <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-1">
              <SearchBar
                open={searchOpen}
                onOpen={openSearch}
                onClose={closeSearch}
                onSearch={applyKeyword}
              />
              <button
                type="button"
                aria-label="打开日历"
                onClick={() => setCalendarOpen(true)}
                className="min-h-11 rounded-lg px-3 text-sm text-neutral-600 hover:bg-neutral-100"
              >
                日历
              </button>
            </div>
          </header>

          <Composer database={database} now={now} backfillRequest={backfillRequest} />

          {filter ? (
            <FilterBar filter={filter} onBackfill={startBackfill} onClose={() => setFilter(null)} />
          ) : null}

          <main className="flex-1 px-4">
            <Timeline database={database} now={now} filter={filter} onTagClick={selectTag} />
          </main>
        </div>

        {calendarOpen ? (
          <CalendarSheet
            database={database}
            now={now}
            selectedDay={filter?.kind === "day" ? filter.dayStart : null}
            onSelectDay={selectDay}
            onClose={() => setCalendarOpen(false)}
          />
        ) : null}
      </div>
    </ToastProvider>
  );
}
