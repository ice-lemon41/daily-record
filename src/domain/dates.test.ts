import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  addLocalMonths,
  calendarGrid,
  combineLocalDateTime,
  dateKey,
  formatClock,
  formatFileStamp,
  formatFullDay,
  formatGroupTitle,
  localDayRange,
  localMonthRange,
  splitLocalDateTime,
  startOfLocalDay,
  weekdayLabel,
} from "./dates";

/** 本地时间构造，避免测试依赖运行环境的 UTC 偏移。 */
function at(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

describe("startOfLocalDay / addLocalDays", () => {
  it("取本地零点", () => {
    expect(startOfLocalDay(at(2026, 11, 17, 21, 40))).toBe(at(2026, 11, 17));
  });

  it("按本地日历加减天数", () => {
    expect(addLocalDays(at(2026, 11, 17, 23, 30), 1)).toBe(at(2026, 11, 18, 23, 30));
    expect(addLocalDays(at(2026, 12, 1), -1)).toBe(at(2026, 11, 30));
  });
});

describe("dateKey", () => {
  it("输出 YYYY-MM-DD", () => {
    expect(dateKey(at(2026, 11, 17, 21, 40))).toBe("2026-11-17");
    expect(dateKey(at(2027, 1, 5))).toBe("2027-01-05");
  });
});

describe("localDayRange / localMonthRange", () => {
  it("自然日范围右端为开区间", () => {
    const range = localDayRange(at(2026, 11, 17, 21, 40));
    expect(range).toEqual({ start: at(2026, 11, 17), end: at(2026, 11, 18) });
  });

  it("月份范围右端为下月 1 日", () => {
    expect(localMonthRange(2026, 11)).toEqual({ start: at(2026, 11, 1), end: at(2026, 12, 1) });
    expect(localMonthRange(2026, 12)).toEqual({ start: at(2026, 12, 1), end: at(2027, 1, 1) });
  });
});

describe("weekdayLabel", () => {
  it("输出中文星期", () => {
    expect(weekdayLabel(at(2026, 11, 17))).toBe("周二");
    expect(weekdayLabel(at(2026, 11, 15))).toBe("周日");
  });
});

describe("formatGroupTitle", () => {
  const now = at(2026, 11, 17, 21, 40);

  it("今天 / 昨天", () => {
    expect(formatGroupTitle(at(2026, 11, 17, 8, 5), now)).toBe("今天");
    expect(formatGroupTitle(at(2026, 11, 16, 23, 59), now)).toBe("昨天");
  });

  it("同年其它日期省略年份", () => {
    expect(formatGroupTitle(at(2026, 11, 1), now)).toBe("11月1日 周日");
  });

  it("跨年日期带年份", () => {
    expect(formatGroupTitle(at(2026, 11, 1), at(2027, 1, 5))).toBe("2026年11月1日 周日");
  });
});

describe("formatClock / formatFileStamp", () => {
  it("输出 HH:mm", () => {
    expect(formatClock(at(2026, 11, 17, 21, 40))).toBe("21:40");
    expect(formatClock(at(2026, 11, 17, 8, 5))).toBe("08:05");
  });

  it("输出文件名时间戳", () => {
    expect(formatFileStamp(at(2026, 11, 17, 21, 40))).toBe("20261117-2140");
  });
});

describe("formatFullDay / addLocalMonths", () => {
  it("筛选标题始终带年份与星期", () => {
    expect(formatFullDay(at(2026, 11, 17, 21, 40))).toBe("2026年11月17日 周二");
  });

  it("月份切换可跨年", () => {
    expect(addLocalMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(addLocalMonths(2027, 1, -1)).toEqual({ year: 2026, month: 12 });
    expect(addLocalMonths(2026, 11, 0)).toEqual({ year: 2026, month: 11 });
  });
});

describe("splitLocalDateTime / combineLocalDateTime", () => {
  it("拆出日期与时分输入框的值", () => {
    expect(splitLocalDateTime(at(2026, 11, 17, 8, 5))).toEqual({
      date: "2026-11-17",
      time: "08:05",
    });
  });

  it("合成后与原始时间一致", () => {
    expect(combineLocalDateTime("2026-11-17", "21:40")).toBe(at(2026, 11, 17, 21, 40));
  });

  it("拒绝非法日期与时分", () => {
    expect(combineLocalDateTime("2026-02-30", "10:00")).toBeNull();
    expect(combineLocalDateTime("2026-13-01", "10:00")).toBeNull();
    expect(combineLocalDateTime("2026-11-17", "24:00")).toBeNull();
    expect(combineLocalDateTime("2026-11-17", "10:60")).toBeNull();
    expect(combineLocalDateTime("2026/11/17", "10:00")).toBeNull();
    expect(combineLocalDateTime("2026-11-17", "")).toBeNull();
  });
});

describe("calendarGrid", () => {
  it("生成周一开头的 6×7 网格", () => {
    const cells = calendarGrid(2026, 11);

    expect(cells).toHaveLength(42);
    expect(cells[0]).toMatchObject({ dateKey: "2026-10-26", day: 26, inMonth: false });
    expect(cells[6]).toMatchObject({ dateKey: "2026-11-01", day: 1, inMonth: true });
    expect(cells[35]).toMatchObject({ dateKey: "2026-11-30", inMonth: true });
    expect(cells[36]).toMatchObject({ dateKey: "2026-12-01", inMonth: false });
    expect(cells[41]).toMatchObject({ dateKey: "2026-12-06", inMonth: false });
  });

  it("网格日期连续", () => {
    const cells = calendarGrid(2026, 2);
    for (let index = 1; index < cells.length; index += 1) {
      expect(cells[index]?.ts).toBe(addLocalDays(cells[index - 1]?.ts ?? 0, 1));
    }
  });
});
