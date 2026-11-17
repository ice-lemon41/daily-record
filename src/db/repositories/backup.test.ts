import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toExportBundle } from "../../domain/export-json";
import { parseImportJson } from "../../domain/import-json";
import type { ExportBundle } from "../../domain/types";
import { type AppDb, createDb } from "../db";
import type { EntryRow } from "../schema";
import { ImportDataError, loadExportSource, replaceAllData } from "./backup";
import { createEntry, deleteEntry } from "./entries";
import { getKv, setKv } from "./kv";
import { createMetric } from "./metrics";

function at(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

const T1 = at(2026, 11, 17, 21, 40);
const T2 = at(2026, 11, 16, 8, 5);

let db: AppDb;

beforeEach(() => {
  db = createDb(`test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  vi.restoreAllMocks();
  db.close();
  await Dexie.delete(db.name);
});

interface Seeded {
  entryId: string;
  secondId: string;
  deletedId: string;
  metricId: string;
}

async function seed(): Promise<Seeded> {
  const metric = await createMetric(db, { name: "体重", unit: "kg" }, 1000);
  const first = await createEntry(db, {
    content: "今天 #健康 体重 70kg",
    occurredAt: T1,
    now: 2000,
    pinned: 1,
    extra: {
      ignoredSuggestions: [
        { name: "步数", unit: "步", value: 8000, raw: "步数 8000步", ignoredAt: 3 },
      ],
    },
  });
  const second = await createEntry(db, {
    content: "插曲 花费 30元",
    occurredAt: T2,
    now: 1500,
  });
  const deleted = await createEntry(db, { content: "已删除 #旧", occurredAt: T2, now: 1000 });
  await deleteEntry(db, deleted.entry.id, 3000);

  return {
    entryId: first.entry.id,
    secondId: second.entry.id,
    deletedId: deleted.entry.id,
    metricId: metric.id,
  };
}

async function bundleFromDb(): Promise<ExportBundle> {
  const source = await loadExportSource(db, T1);
  const text = JSON.stringify(toExportBundle(source));
  const parsed = parseImportJson(text);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.bundle;
}

describe("loadExportSource", () => {
  it("排除软删除条目并保留全部指标与导出时间", async () => {
    const { entryId, secondId, deletedId, metricId } = await seed();

    const source = await loadExportSource(db, T1);

    expect(source.exportedAt).toBe(T1);
    expect(source.entries.map((entry) => entry.id).sort()).toEqual([entryId, secondId].sort());
    expect(source.entries.some((entry) => entry.id === deletedId)).toBe(false);
    expect(source.metrics.map((metric) => metric.id)).toEqual([metricId]);
  });
});

describe("replaceAllData", () => {
  it("导出再导入后逐字段 round-trip", async () => {
    const seeded = await seed();
    const bundle = await bundleFromDb();

    const target = createDb(`test-${crypto.randomUUID()}`);
    try {
      await setKv(target, "draft", { content: "旧草稿" });
      await setKv(target, "settings", { theme: "system" });
      await setKv(target, "lastExportAt", 777);
      await target.entries.add(junkEntry());

      const summary = await replaceAllData(target, bundle, 12_345);

      expect(summary).toEqual({
        entries: 2,
        metrics: 1,
        tags: 1,
        metricValues: 1,
      });

      const entries = await target.entries.toArray();
      expect(entries.map((entry) => entry.id).sort()).toEqual(
        bundle.entries.map((entry) => entry.id).sort(),
      );

      const first = await target.entries.get(seeded.entryId);
      expect(first).toMatchObject({
        content: "今天 #健康 体重 70kg",
        occurredAt: T1,
        createdAt: 2000,
        pinned: 1,
        deletedAt: 0,
      });
      expect(first?.extra.ignoredSuggestions).toHaveLength(1);

      expect(await target.entries.where("deletedAt").equals(0).count()).toBe(2);
      expect(await target.metrics.get(seeded.metricId)).toMatchObject({
        name: "体重",
        nameLower: "体重",
        unit: "kg",
        archived: 0,
      });
      expect((await target.tags.toArray()).map((tag) => tag.name)).toEqual(["健康"]);
      const tag = await target.tags.where("name").equals("健康").first();
      expect(
        await target.entryTags
          .where("tagId")
          .equals(tag?.id ?? "")
          .count(),
      ).toBe(1);
      const values = await target.entryMetrics.where("entryId").equals(seeded.entryId).toArray();
      expect(values).toHaveLength(1);
      expect(values[0]).toMatchObject({ value: 70, unit: "kg", nameSnapshot: "体重" });

      expect(await getKv(target, "draft")).toBeUndefined();
      expect(await getKv(target, "settings")).toEqual({ theme: "system" });
      expect(await getKv(target, "lastExportAt")).toBe(777);
      expect(await getKv(target, "schemaVersion")).toBe(1);
      expect(await getKv(target, "lastImportAt")).toBe(12_345);
    } finally {
      target.close();
      await Dexie.delete(target.name);
    }
  });

  it("导入空备份会清空旧数据", async () => {
    await seed();

    const bundle = await bundleFromDb();
    const empty: ExportBundle = { ...bundle, entries: [], metrics: [] };
    const summary = await replaceAllData(db, empty, 1);

    expect(summary).toEqual({ entries: 0, metrics: 0, tags: 0, metricValues: 0 });
    expect(await db.entries.count()).toBe(0);
    expect(await db.tags.count()).toBe(0);
    expect(await db.entryTags.count()).toBe(0);
    expect(await db.entryMetrics.count()).toBe(0);
    expect(await db.metrics.count()).toBe(0);
  });

  it("备份内 ID 重复时拒绝写入且不改动现有数据", async () => {
    const seeded = await seed();
    const bundle = await bundleFromDb();
    const firstEntry = bundle.entries[0];
    if (!firstEntry) throw new Error("缺少测试数据");
    const duplicated: ExportBundle = { ...bundle, entries: [firstEntry, firstEntry] };

    await expect(replaceAllData(db, duplicated, 1)).rejects.toBeInstanceOf(ImportDataError);
    expect(await db.entries.get(seeded.entryId)).toBeDefined();
    expect(await db.tags.count()).toBe(2);
  });

  it("写入中途失败会整体回滚", async () => {
    const seeded = await seed();
    const bundle = await bundleFromDb();
    await setKv(db, "draft", { content: "草稿" });

    const spy = vi.spyOn(db.entries, "bulkPut").mockRejectedValueOnce(new Error("磁盘写入失败"));

    await expect(replaceAllData(db, bundle, 1)).rejects.toThrow("磁盘写入失败");
    spy.mockRestore();

    expect(await db.entries.get(seeded.entryId)).toBeDefined();
    expect(await db.tags.count()).toBe(2);
    expect(await getKv(db, "draft")).toEqual({ content: "草稿" });
    expect(await getKv(db, "schemaVersion")).toBeUndefined();
  });
});

function junkEntry(): EntryRow {
  return {
    id: crypto.randomUUID(),
    content: "旧条目",
    occurredAt: 1,
    createdAt: 1,
    updatedAt: 1,
    pinned: 0,
    deletedAt: 0,
    extra: { ignoredSuggestions: [] },
  };
}
