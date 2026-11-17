import { describe, expect, it } from "vitest";
import type { EntryRow } from "../../db/schema";
import { groupEntriesByDay } from "./grouping";

function at(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

function entry(id: string, occurredAt: number): EntryRow {
  return {
    id,
    content: id,
    occurredAt,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    pinned: 0,
    deletedAt: 0,
    extra: { ignoredSuggestions: [] },
  };
}

const NOW = at(2026, 11, 17, 21, 40);

describe("groupEntriesByDay", () => {
  it("按本地日期分组并保留倒序", () => {
    const groups = groupEntriesByDay(
      [
        entry("a", at(2026, 11, 17, 21, 0)),
        entry("b", at(2026, 11, 17, 8, 0)),
        entry("c", at(2026, 11, 16, 23, 0)),
        entry("d", at(2026, 11, 1, 9, 0)),
      ],
      NOW,
    );

    expect(groups.map((group) => group.title)).toEqual(["今天", "昨天", "11月1日 周日"]);
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      ["a", "b"],
      ["c"],
      ["d"],
    ]);
  });

  it("空列表返回空数组", () => {
    expect(groupEntriesByDay([], NOW)).toEqual([]);
  });
});
