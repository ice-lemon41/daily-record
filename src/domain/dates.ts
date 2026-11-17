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

/** 筛选 chip / 日历标题用：YYYY年M月D日 周X，始终带年份。 */
export function formatFullDay(ts: number): string {
  const date = new Date(ts);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${weekdayLabel(ts)}`;
}

/** 按本地日历加减月份，返回 1–12 的月份与年份。 */
export function addLocalMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export interface LocalDateTimeParts {
  /** YYYY-MM-DD，可直接用于 <input type="date">。 */
  date: string;
  /** HH:mm，可直接用于 <input type="time">。 */
  time: string;
}

/** 把时间戳拆成日期、时分输入框的值（PRD FR-01-5）。 */
export function splitLocalDateTime(ts: number): LocalDateTimeParts {
  return { date: dateKey(ts), time: formatClock(ts) };
}

/** 把本地日期 + 时分合成毫秒；非法日期（如 2 月 30 日）返回 null。 */
export function combineLocalDateTime(date: string, time: string): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/u.exec(time);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (hour > 23 || minute > 59) return null;

  const ts = new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
  const roundTrip = splitLocalDateTime(ts);
  if (roundTrip.date !== date || roundTrip.time !== time) return null;

  return ts;
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
