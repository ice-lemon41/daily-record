import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "./FilterBar";

function at(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getTime();
}

describe("FilterBar", () => {
  it("按天筛选显示完整日期，并提供补记", () => {
    const onBackfill = vi.fn();
    render(
      <FilterBar
        filter={{ kind: "day", dayStart: at(2026, 11, 16) }}
        onBackfill={onBackfill}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("当前筛选")).toHaveTextContent("2026年11月16日 周一");
    fireEvent.click(screen.getByRole("button", { name: "在这天补记" }));
    expect(onBackfill).toHaveBeenCalledTimes(1);
  });

  it("标签与搜索显示各自 chip，关闭按钮可用", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <FilterBar filter={{ kind: "tag", name: "健康", nameLower: "健康" }} onClose={onClose} />,
    );

    expect(screen.getByLabelText("当前筛选")).toHaveTextContent("#健康");
    expect(screen.queryByRole("button", { name: "在这天补记" })).toBeNull();

    rerender(<FilterBar filter={{ kind: "search", keyword: "开会" }} onClose={onClose} />);
    expect(screen.getByLabelText("当前筛选")).toHaveTextContent("搜索「开会」");

    fireEvent.click(screen.getByRole("button", { name: "关闭筛选" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
