import Dexie from "dexie";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emptyExtra } from "../../domain/types";
import { type AppDb, createDb } from "../db";
import { searchEntries } from "../repositories/entries";
import type { EntryRow } from "../schema";

/**
 * 10k 条记录下的搜索基准（技术方案 §8）。
 * 只验证结果正确并打印耗时，不设硬性阈值，避免不同机器上抖动。
 * 运行：`npm run test:bench`
 */
const COUNT = 10_000;
const OCCURRED_BASE = new Date(2026, 0, 1, 0, 0, 0, 0).getTime();

let db: AppDb;

function makeRow(index: number): EntryRow {
  const occurredAt = OCCURRED_BASE + index * 60_000;
  return {
    id: `bench-${index}`,
    content: index % 100 === 0 ? `第 ${index} 条 会议记录` : `第 ${index} 条 日常记录`,
    occurredAt,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    pinned: 0,
    deletedAt: 0,
    extra: emptyExtra(),
  };
}

async function measure(label: string, keyword: string, runs = 3): Promise<number[]> {
  const timings: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const startedAt = performance.now();
    const result = await searchEntries(db, keyword);
    timings.push(performance.now() - startedAt);
    expect(result.length).toBeGreaterThan(0);
  }
  const average = timings.reduce((sum, value) => sum + value, 0) / timings.length;
  console.log(
    `[bench] ${label}: 平均 ${average.toFixed(1)}ms，明细 ${timings.map((v) => v.toFixed(1)).join(" / ")}ms`,
  );
  return timings;
}

beforeAll(async () => {
  db = createDb(`bench-${crypto.randomUUID()}`);
  const rows = Array.from({ length: COUNT }, (_, index) => makeRow(index));
  const startedAt = performance.now();
  await db.entries.bulkAdd(rows);
  console.log(`[bench] 写入 ${COUNT} 条：${(performance.now() - startedAt).toFixed(1)}ms`);
}, 120_000);

afterAll(async () => {
  db.close();
  await Dexie.delete(db.name);
});

describe("searchEntries @ 10k", () => {
  it("选择性关键词（命中 100 条）", async () => {
    const timings = await measure("命中 100 条", "会议");

    expect((await searchEntries(db, "会议")).length).toBe(COUNT / 100);
    expect(timings.every((value) => Number.isFinite(value))).toBe(true);
  });

  it("宽泛关键词（命中 9900 条）", async () => {
    const result = await searchEntries(db, "日常");
    expect(result.length).toBe(COUNT - COUNT / 100);

    await measure("命中 9900 条", "日常", 2);
  });

  it("无命中关键词", async () => {
    const result = await searchEntries(db, "不存在的关键词");
    expect(result).toEqual([]);
  });
});
