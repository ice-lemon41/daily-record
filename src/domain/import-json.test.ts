import { describe, expect, it } from "vitest";
import { parseImportJson } from "./import-json";
import type { ExportBundle } from "./types";

type Entry = ExportBundle["entries"][number];
type Metric = ExportBundle["metrics"][number];

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: crypto.randomUUID(),
    content: "今天 #健康",
    occurredAt: 1000,
    createdAt: 900,
    updatedAt: 950,
    pinned: false,
    extra: { ignoredSuggestions: [] },
    ...overrides,
  };
}

function makeMetric(overrides: Partial<Metric> = {}): Metric {
  return {
    id: crypto.randomUUID(),
    name: "体重",
    unit: "kg",
    archived: false,
    createdAt: 500,
    ...overrides,
  };
}

function makeBundle(overrides: Partial<ExportBundle> = {}): ExportBundle {
  return {
    schemaVersion: 1,
    app: "daily-record",
    exportedAt: 2000,
    metrics: [makeMetric()],
    entries: [makeEntry()],
    ...overrides,
  };
}

function parse(value: unknown) {
  return parseImportJson(JSON.stringify(value));
}

describe("parseImportJson", () => {
  it("接受合法备份并统计条目与时间范围", () => {
    const entries = [
      makeEntry({ occurredAt: 3000 }),
      makeEntry({ occurredAt: 1000 }),
      makeEntry({ occurredAt: 2000 }),
    ];
    const result = parse(makeBundle({ entries }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.entries).toHaveLength(3);
    expect(result.stats).toEqual({ entries: 3, metrics: 1, from: 1000, to: 3000 });
  });

  it("没有条目时时间范围为 null", () => {
    const result = parse(makeBundle({ entries: [] }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats).toEqual({ entries: 0, metrics: 1, from: null, to: null });
  });

  it("缺少 extra 时补默认值", () => {
    const entry = {
      id: crypto.randomUUID(),
      content: "没有附加字段",
      occurredAt: 1,
      createdAt: 1,
      updatedAt: 1,
      pinned: true,
    };
    const result = parse(makeBundle({ entries: [entry as Entry] }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bundle.entries[0]?.extra).toEqual({ ignoredSuggestions: [] });
  });

  it("JSON 损坏时报 invalid-json", () => {
    const result = parseImportJson("{ 不是 json");

    expect(result).toEqual({
      ok: false,
      code: "invalid-json",
      message: "文件内容损坏，无法解析",
    });
  });

  it("版本不支持时报 invalid-version", () => {
    const result = parse(makeBundle({ schemaVersion: 2 as 1 }));

    expect(result).toMatchObject({ ok: false, code: "invalid-version", path: "schemaVersion" });
    if (result.ok) return;
    expect(result.message).toContain("2");
  });

  it("根对象形状不对时报 invalid-shape", () => {
    const result = parse(null);

    expect(result).toMatchObject({ ok: false, code: "invalid-shape", path: "根对象" });
  });

  it("缺少字段时指出出错路径", () => {
    const bundle = makeBundle();
    const result = parse({ ...bundle, entries: [{ ...bundle.entries[0], pinned: "yes" }] });

    expect(result).toMatchObject({
      ok: false,
      code: "invalid-shape",
      path: "entries.0.pinned",
    });
  });

  it("时间戳必须是整数", () => {
    const result = parse(makeBundle({ entries: [makeEntry({ occurredAt: 1000.5 })] }));

    expect(result).toMatchObject({ ok: false, code: "invalid-shape" });
  });

  it("条目 ID 重复时报 duplicate-id", () => {
    const id = crypto.randomUUID();
    const result = parse(
      makeBundle({ entries: [makeEntry({ id }), makeEntry({ id, content: "另一条" })] }),
    );

    expect(result).toMatchObject({ ok: false, code: "duplicate-id", path: "entries.id" });
  });

  it("指标 ID 重复时报 duplicate-id", () => {
    const id = crypto.randomUUID();
    const result = parse(
      makeBundle({ metrics: [makeMetric({ id }), makeMetric({ id, name: "花费" })] }),
    );

    expect(result).toMatchObject({ ok: false, code: "duplicate-id", path: "metrics.id" });
  });

  it("app 标识必须匹配", () => {
    const result = parse({ ...makeBundle(), app: "other" });

    expect(result).toMatchObject({ ok: false, code: "invalid-shape" });
  });
});
