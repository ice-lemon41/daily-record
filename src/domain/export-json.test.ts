import { describe, expect, it } from "vitest";
import { type ExportSource, exportFileName, toExportBundle } from "./export-json";

function at(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

const EXPORTED_AT = at(2026, 11, 17, 21, 40);

function source(): ExportSource {
  return {
    exportedAt: EXPORTED_AT,
    metrics: [
      { id: "m-late", name: "花费", unit: "元", archived: false, createdAt: 2000 },
      { id: "m-early", name: "体重", unit: "kg", archived: 0, createdAt: 1000 },
    ],
    entries: [
      {
        id: "e-new",
        content: "晚上 体重 71kg",
        occurredAt: 3000,
        createdAt: 30,
        updatedAt: 30,
        pinned: 1,
        extra: {
          ignoredSuggestions: [
            { name: "步数", unit: "步", value: 8000, raw: "步数 8000步", ignoredAt: 5 },
          ],
        },
      },
      {
        id: "e-old",
        content: "早上 体重 70kg",
        occurredAt: 1000,
        createdAt: 10,
        updatedAt: 10,
        pinned: 0,
      },
      {
        id: "e-deleted",
        content: "已删除",
        occurredAt: 2000,
        createdAt: 20,
        updatedAt: 25,
        pinned: 0,
        deletedAt: 26,
      },
    ],
  };
}

describe("toExportBundle", () => {
  it("输出 PRD §8.3 的顶层结构", () => {
    const bundle = toExportBundle(source());

    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.app).toBe("daily-record");
    expect(bundle.exportedAt).toBe(EXPORTED_AT);
  });

  it("过滤软删除条目并按时间升序", () => {
    const bundle = toExportBundle(source());

    expect(bundle.entries.map((entry) => entry.id)).toEqual(["e-old", "e-new"]);
  });

  it("把 0/1 转成布尔值，且不导出 deletedAt", () => {
    const [old, recent] = toExportBundle(source()).entries;

    expect(old?.pinned).toBe(false);
    expect(recent?.pinned).toBe(true);
    expect(recent).not.toHaveProperty("deletedAt");
  });

  it("缺失 extra 时补空数组，保留既有忽略建议", () => {
    const [old, recent] = toExportBundle(source()).entries;

    expect(old?.extra).toEqual({ ignoredSuggestions: [] });
    expect(recent?.extra.ignoredSuggestions).toHaveLength(1);
  });

  it("指标按创建时间升序，archived 转布尔值", () => {
    const bundle = toExportBundle(source());

    expect(bundle.metrics.map((metric) => metric.id)).toEqual(["m-early", "m-late"]);
    expect(bundle.metrics[0]?.archived).toBe(false);
    expect(bundle.metrics[1]?.archived).toBe(false);
  });

  it("指标创建时间相同时按 id 稳定排序", () => {
    const bundle = toExportBundle({
      exportedAt: EXPORTED_AT,
      entries: [],
      metrics: [
        { id: "m-b", name: "B", unit: "", archived: false, createdAt: 100 },
        { id: "m-a", name: "A", unit: "", archived: false, createdAt: 100 },
      ],
    });

    expect(bundle.metrics.map((metric) => metric.id)).toEqual(["m-a", "m-b"]);
  });

  it("时间相同时按创建时间与 id 稳定排序", () => {
    const bundle = toExportBundle({
      exportedAt: EXPORTED_AT,
      metrics: [],
      entries: [
        { id: "b", content: "b", occurredAt: 100, createdAt: 1, updatedAt: 1, pinned: 0 },
        { id: "a", content: "a", occurredAt: 100, createdAt: 2, updatedAt: 1, pinned: 0 },
        { id: "c", content: "c", occurredAt: 100, createdAt: 1, updatedAt: 1, pinned: 0 },
      ],
    });

    expect(bundle.entries.map((entry) => entry.id)).toEqual(["b", "c", "a"]);
  });
});

describe("exportFileName", () => {
  it("带本地时间戳与扩展名", () => {
    expect(exportFileName("json", EXPORTED_AT)).toBe("daily-record-20261117-2140.json");
    expect(exportFileName("md", EXPORTED_AT)).toBe("daily-record-20261117-2140.md");
  });
});
