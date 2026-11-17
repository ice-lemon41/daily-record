import { describe, expect, it } from "vitest";
import { type MarkdownSource, toMarkdown } from "./export-markdown";

function at(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

const EXPORTED_AT = at(2026, 11, 17, 21, 40);

function source(): MarkdownSource {
  return {
    exportedAt: EXPORTED_AT,
    entries: [
      {
        id: "e-late",
        content: "今天很累\n体重 70.5kg",
        occurredAt: at(2026, 11, 17, 21, 40),
        createdAt: 30,
      },
      {
        id: "e-morning",
        content: "早上好 #健康",
        occurredAt: at(2026, 11, 17, 8, 5),
        createdAt: 20,
      },
      {
        id: "e-yesterday",
        content: "睡前",
        occurredAt: at(2026, 11, 16, 23, 0),
        createdAt: 10,
      },
      {
        id: "e-deleted",
        content: "已删除",
        occurredAt: at(2026, 11, 15, 12, 0),
        createdAt: 5,
        deletedAt: 99,
      },
    ],
    metricValues: [
      { entryId: "e-late", nameSnapshot: "体重", value: 70.5, unit: "kg" },
      { entryId: "e-morning", nameSnapshot: "体重", value: 70, unit: "" },
      { entryId: "e-deleted", nameSnapshot: "体重", value: 1, unit: "kg" },
    ],
  };
}

describe("toMarkdown", () => {
  it("按本地日期分组并降序排列", () => {
    const markdown = toMarkdown(source());

    expect(markdown).toBe(
      [
        "# 日常记录",
        "",
        "> 导出时间：2026-11-17 21:40",
        "",
        "## 2026-11-17 周二",
        "",
        "- 21:40 今天很累",
        "  体重 70.5kg",
        "  - 体重 70.5 kg",
        "- 08:05 早上好 #健康",
        "  - 体重 70",
        "",
        "## 2026-11-16 周一",
        "",
        "- 23:00 睡前",
        "",
      ].join("\n"),
    );
  });

  it("不包含软删除条目", () => {
    expect(toMarkdown(source())).not.toContain("已删除");
  });

  it("没有记录时给出占位提示", () => {
    const markdown = toMarkdown({ exportedAt: EXPORTED_AT, entries: [], metricValues: [] });

    expect(markdown).toBe(
      ["# 日常记录", "", "> 导出时间：2026-11-17 21:40", "", "（没有记录）", ""].join("\n"),
    );
  });

  it("同一指标的多个值按名称与数值排序", () => {
    const markdown = toMarkdown({
      exportedAt: EXPORTED_AT,
      entries: [{ id: "e1", content: "记录", occurredAt: at(2026, 11, 17, 9, 0), createdAt: 1 }],
      metricValues: [
        { entryId: "e1", nameSnapshot: "beta", value: 2, unit: "次" },
        { entryId: "e1", nameSnapshot: "alpha", value: 2, unit: "次" },
        { entryId: "e1", nameSnapshot: "alpha", value: 1, unit: "次" },
      ],
    });

    const metricLines = markdown.split("\n").filter((line) => line.startsWith("  - "));
    expect(metricLines).toEqual(["  - alpha 1 次", "  - alpha 2 次", "  - beta 2 次"]);
  });

  it("发生时间相同时按创建时间倒序", () => {
    const markdown = toMarkdown({
      exportedAt: EXPORTED_AT,
      entries: [
        { id: "a", content: "先创建", occurredAt: at(2026, 11, 17, 9, 0), createdAt: 1 },
        { id: "b", content: "后创建", occurredAt: at(2026, 11, 17, 9, 0), createdAt: 2 },
      ],
      metricValues: [],
    });

    const entryLines = markdown.split("\n").filter((line) => line.startsWith("- "));
    expect(entryLines).toEqual(["- 09:00 后创建", "- 09:00 先创建"]);
  });
});
