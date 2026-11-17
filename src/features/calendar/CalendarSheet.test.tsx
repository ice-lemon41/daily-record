import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEntry } from "../../db/repositories/entries";
import { cleanupTestDbs, makeTestDb } from "../../test/db";
import { CalendarSheet } from "./CalendarSheet";

function at(year: number, month: number, day: number, hour = 0): number {
  return new Date(year, month - 1, day, hour, 0, 0, 0).getTime();
}

const NOW = at(2026, 11, 17, 21);

afterEach(async () => {
  cleanup();
  await cleanupTestDbs();
});

describe("CalendarSheet", () => {
  it("显示当前月份，周一开头", () => {
    render(
      <CalendarSheet
        database={makeTestDb()}
        now={NOW}
        selectedDay={null}
        onSelectDay={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "2026年11月" })).toBeInTheDocument();
    const weekdays = screen.getAllByText(/^[一二三四五六日]$/u).map((node) => node.textContent);
    expect(weekdays.slice(0, 7)).toEqual(["一", "二", "三", "四", "五", "六", "日"]);
  });

  it("有记录的日期显示圆点，点击后回传本地零点", async () => {
    const database = makeTestDb();
    await createEntry(database, {
      content: "今天有记录",
      occurredAt: at(2026, 11, 17, 10),
      now: NOW,
    });
    const onSelectDay = vi.fn();

    render(
      <CalendarSheet
        database={database}
        now={NOW}
        selectedDay={null}
        onSelectDay={onSelectDay}
        onClose={vi.fn()}
      />,
    );

    const dayButton = await screen.findByRole("button", { name: /11月17日 周二，有记录/u });
    expect(dayButton).toHaveAttribute("aria-current", "date");

    fireEvent.click(dayButton);
    expect(onSelectDay).toHaveBeenCalledWith(at(2026, 11, 17));
  });

  it("切换到上月遇到跨年，并可以回到今天", () => {
    render(
      <CalendarSheet
        database={makeTestDb()}
        now={at(2027, 1, 5, 9)}
        selectedDay={null}
        onSelectDay={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "2027年1月" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "上个月" }));
    expect(screen.getByRole("heading", { name: "2026年12月" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下个月" }));
    fireEvent.click(screen.getByRole("button", { name: "下个月" }));
    expect(screen.getByRole("heading", { name: "2027年2月" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "回到今天" }));
    expect(screen.getByRole("heading", { name: "2027年1月" })).toBeInTheDocument();
  });

  it("打开时定位到已选日期并标记选中", () => {
    render(
      <CalendarSheet
        database={makeTestDb()}
        now={NOW}
        selectedDay={at(2026, 12, 3)}
        onSelectDay={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "2026年12月" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /12月3日/u })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
