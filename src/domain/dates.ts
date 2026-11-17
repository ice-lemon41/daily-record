const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function startOfLocalDay(ts: number): number {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function addLocalDays(ts: number, days: number): number {
  const date = new Date(ts);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

/** 本地日期键，YYYY-MM-DD。 */
export function dateKey(ts: number): string {
  const date = new Date(ts);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 本地自然日范围，end 为开区间。 */
export function localDayRange(ts: number): { start: number; end: number } {
  const start = startOfLocalDay(ts);
  return { start, end: addLocalDays(start, 1) };
}

/** 本地月份范围，month 为 1–12，end 为开区间。 */
export function localMonthRange(year: number, month: number): { start: number; end: number } {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 1, 0, 0, 0, 0);
  return { start: start.getTime(), end: end.getTime() };
}

export function weekdayLabel(ts: number): string {
  return WEEKDAYS[new Date(ts).getDay()] as string;
}

/** 今天 / 昨天 / M月D日 周X（跨年加年份）。 */
export function formatGroupTitle(ts: number, now: number): string {
  const day = startOfLocalDay(ts);
  const today = startOfLocalDay(now);

  if (day === today) return "今天";
  if (day === addLocalDays(today, -1)) return "昨天";

  const date = new Date(ts);
  const nowDate = new Date(now);
  const year = date.getFullYear() === nowDate.getFullYear() ? "" : `${date.getFullYear()}年`;
  return `${year}${date.getMonth() + 1}月${date.getDate()}日 ${weekdayLabel(ts)}`;
}

/** HH:mm，本地时间。 */
export function formatClock(ts: number): string {
  const date = new Date(ts);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 文件名里的本地时间戳：YYYYMMDD-HHmm。 */
export function formatFileStamp(ts: number): string {
  const date = new Date(ts);
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

export interface CalendarCell {
  ts: number;
  day: number;
  dateKey: string;
  inMonth: boolean;
}

/** 6×7 的月视图网格，周一开头，含前后月补位（PRD FR-06）。 */
export function calendarGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const offset = (first.getDay() + 6) % 7;
  const gridStart = addLocalDays(first.getTime(), -offset);

  const cells: CalendarCell[] = [];
  for (let index = 0; index < 42; index += 1) {
    const ts = addLocalDays(gridStart, index);
    const date = new Date(ts);
    cells.push({
      ts,
      day: date.getDate(),
      dateKey: dateKey(ts),
      inMonth: date.getMonth() === month - 1 && date.getFullYear() === year,
    });
  }
  return cells;
}
