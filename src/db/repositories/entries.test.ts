import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppDb, createDb } from "../db";
import {
  countEntries,
  createEntry,
  deleteEntry,
  EmptyContentError,
  EntryNotFoundError,
  getEntry,
  listEntriesBetween,
  listEntriesByTag,
  listEntriesForDay,
  listMetricValuesForEntries,
  listPinnedEntries,
  listTimeline,
  restoreEntry,
  searchEntries,
  updateEntry,
} from "./entries";
import { getKv, setKv } from "./kv";
import { archiveMetric, createMetric, updateMetric } from "./metrics";

function at(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

const NOW = at(2026, 11, 17, 21, 40);

let db: AppDb;

beforeEach(() => {
  db = createDb(`test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  db.close();
  await Dexie.delete(db.name);
});

async function waitForTags(): Promise<string[]> {
  return (await db.tags.toArray()).map((tag) => tag.name).sort();
}

describe("createEntry", () => {
  it("保存条目、标签与指标，并清空草稿", async () => {
    await createMetric(db, { name: "体重", unit: "kg" }, 1000);
    await setKv(db, "draft", { content: "未提交" });

    const { entry, suggestions } = await createEntry(db, {
      content: "今天 #健康 体重 70kg",
      occurredAt: NOW,
      now: 5000,
    });

    expect(entry).toMatchObject({
      content: "今天 #健康 体重 70kg",
      occurredAt: NOW,
      createdAt: 5000,
      updatedAt: 5000,
      pinned: 0,
      deletedAt: 0,
      extra: { ignoredSuggestions: [] },
    });
    expect(suggestions).toEqual([]);
    expect(await db.entries.count()).toBe(1);
    expect(await waitForTags()).toEqual(["健康"]);
    expect(await db.entryTags.count()).toBe(1);
    expect(await db.entryMetrics.where("entryId").equals(entry.id).toArray()).toEqual([
      expect.objectContaining({
        metricId: expect.any(String),
        entryId: entry.id,
        nameSnapshot: "体重",
        value: 70,
        unit: "kg",
        raw: "体重 70kg",
      }),
    ]);
    expect(await getKv(db, "draft")).toBeUndefined();
  });

  it("拒绝空正文", async () => {
    await expect(createEntry(db, { content: "   \n ", occurredAt: NOW })).rejects.toBeInstanceOf(
      EmptyContentError,
    );
    expect(await db.entries.count()).toBe(0);
  });

  it("英文标签大小写不同只存一份", async () => {
    const { entry } = await createEntry(db, { content: "#English #english", occurredAt: NOW });

    expect(await waitForTags()).toEqual(["english"]);
    expect(await db.entryTags.where("entryId").equals(entry.id).count()).toBe(1);
  });

  it("返回新指标建议，并过滤已忽略的建议", async () => {
    const { suggestions } = await createEntry(db, {
      content: "步数 8000步 睡眠 7小时",
      occurredAt: NOW,
      extra: {
        ignoredSuggestions: [
          { name: "步数", unit: "步", value: 8000, raw: "步数 8000步", ignoredAt: 1 },
        ],
      },
    });

    expect(suggestions.map((item) => item.name)).toEqual(["睡眠"]);
  });
});

describe("updateEntry", () => {
  it("重建标签与指标，并清理孤立标签", async () => {
    await createMetric(db, { name: "体重", unit: "kg" }, 1000);
    const { entry } = await createEntry(db, {
      content: "#健康 体重 70kg",
      occurredAt: NOW,
      now: 2000,
    });

    const result = await updateEntry(db, entry.id, { content: "#工作 体重 71kg" }, 6000);

    expect(result.entry).toMatchObject({ content: "#工作 体重 71kg", updatedAt: 6000 });
    expect(await waitForTags()).toEqual(["工作"]);
    expect(await db.entryTags.where("entryId").equals(entry.id).count()).toBe(1);
    const values = await db.entryMetrics.where("entryId").equals(entry.id).toArray();
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({ value: 71, unit: "kg" });
  });

  it("修改发生时间时同步更新标签分页列", async () => {
    const { entry } = await createEntry(db, { content: "#健康", occurredAt: NOW, now: 1000 });
    const moved = NOW - 60_000;

    await updateEntry(db, entry.id, { occurredAt: moved }, 2000);

    const [link] = await db.entryTags.where("entryId").equals(entry.id).toArray();
    expect(link?.occurredAt).toBe(moved);
  });

  it("改单位后旧正文仍按历史快照重建", async () => {
    const metric = await createMetric(db, { name: "体重", unit: "kg" }, 1000);
    const { entry } = await createEntry(db, { content: "体重 70kg", occurredAt: NOW, now: 2000 });

    await updateMetric(db, metric.id, { unit: "斤" });
    const result = await updateEntry(db, entry.id, { content: "体重 70kg 很好" }, 3000);

    expect(result.entry.updatedAt).toBe(3000);
    const values = await db.entryMetrics.where("entryId").equals(entry.id).toArray();
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({
      metricId: metric.id,
      value: 70,
      unit: "kg",
      nameSnapshot: "体重",
    });
  });

  it("指标改名或归档后旧正文仍能命中", async () => {
    const metric = await createMetric(db, { name: "体重", unit: "kg" }, 1000);
    const { entry } = await createEntry(db, { content: "体重 70kg", occurredAt: NOW, now: 2000 });

    await updateMetric(db, metric.id, { name: "重量" });
    await archiveMetric(db, metric.id);
    await updateEntry(db, entry.id, { content: "体重 70kg 仍然记住" }, 3000);

    const values = await db.entryMetrics.where("entryId").equals(entry.id).toArray();
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({ metricId: metric.id, value: 70 });
  });

  it("拒绝不存在的条目与空正文", async () => {
    await expect(updateEntry(db, "missing", { content: "x" })).rejects.toBeInstanceOf(
      EntryNotFoundError,
    );

    const { entry } = await createEntry(db, { content: "原文", occurredAt: NOW });
    await expect(updateEntry(db, entry.id, { content: "  " })).rejects.toBeInstanceOf(
      EmptyContentError,
    );
  });
});

describe("软删除与恢复", () => {
  it("删除后查询不到，恢复后重新出现", async () => {
    const { entry } = await createEntry(db, { content: "#健康", occurredAt: NOW, now: 1000 });

    const deleted = await deleteEntry(db, entry.id, 2000);
    expect(deleted).toMatchObject({ deletedAt: 2000, updatedAt: 2000 });
    expect(await getEntry(db, entry.id)).toBeUndefined();
    expect(await countEntries(db)).toBe(0);
    expect((await listTimeline(db, { pinned: false })).items).toEqual([]);
    expect(await listEntriesBetween(db, NOW - 1, NOW + 1)).toEqual([]);
    expect((await listEntriesByTag(db, "健康")).items).toEqual([]);

    const restored = await restoreEntry(db, entry.id, 3000);
    expect(restored).toMatchObject({ deletedAt: 0, updatedAt: 3000 });
    expect(await getEntry(db, entry.id)).toBeDefined();
    expect(await countEntries(db)).toBe(1);
  });

  it("重复删除或恢复不存在的条目会报错", async () => {
    const { entry } = await createEntry(db, { content: "原文", occurredAt: NOW });
    await deleteEntry(db, entry.id);

    await expect(deleteEntry(db, entry.id)).rejects.toBeInstanceOf(EntryNotFoundError);
    await expect(restoreEntry(db, "missing")).rejects.toBeInstanceOf(EntryNotFoundError);
    await expect(updateEntry(db, entry.id, { content: "改不了" })).rejects.toBeInstanceOf(
      EntryNotFoundError,
    );
  });
});

describe("listTimeline", () => {
  async function seed(count: number): Promise<void> {
    for (let index = 1; index <= count; index += 1) {
      await createEntry(db, {
        content: `第 ${index} 条`,
        occurredAt: index,
        now: index,
      });
    }
  }

  it("按发生时间倒序游标分页", async () => {
    await seed(5);

    const first = await listTimeline(db, { pinned: false, limit: 2 });
    expect(first.items.map((entry) => entry.occurredAt)).toEqual([5, 4]);
    expect(first.nextCursor).toEqual({
      occurredAt: 4,
      createdAt: 4,
      id: first.items[1]?.id,
    });

    const second = await listTimeline(db, {
      pinned: false,
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(second.items.map((entry) => entry.occurredAt)).toEqual([3, 2]);

    const third = await listTimeline(db, {
      pinned: false,
      limit: 2,
      cursor: second.nextCursor,
    });
    expect(third.items.map((entry) => entry.occurredAt)).toEqual([1]);
    expect(third.nextCursor).toBeNull();
  });

  it("同一毫秒的条目分页不重复不丢条", async () => {
    const ids = new Set<string>();
    for (let index = 0; index < 3; index += 1) {
      const { entry } = await createEntry(db, {
        content: `同一时刻 ${index}`,
        occurredAt: 100,
        now: 100,
      });
      ids.add(entry.id);
    }

    const first = await listTimeline(db, { pinned: false, limit: 2 });
    const second = await listTimeline(db, { pinned: false, limit: 2, cursor: first.nextCursor });

    const seen = [...first.items, ...second.items].map((entry) => entry.id);
    expect(seen).toHaveLength(3);
    expect(new Set(seen)).toEqual(ids);
    expect(second.nextCursor).toBeNull();
  });

  it("置顶区单独分页，且不混入普通时间线", async () => {
    await createEntry(db, { content: "普通", occurredAt: 1, now: 1 });
    await createEntry(db, { content: "置顶旧", occurredAt: 2, now: 2, pinned: 1 });
    await createEntry(db, { content: "置顶新", occurredAt: 3, now: 3, pinned: 1 });

    expect((await listTimeline(db, { pinned: false })).items.map((e) => e.content)).toEqual([
      "普通",
    ]);
    expect((await listTimeline(db, { pinned: true })).items.map((e) => e.content)).toEqual([
      "置顶新",
      "置顶旧",
    ]);
  });

  it("软删除的条目不出现在时间线", async () => {
    const { entry } = await createEntry(db, { content: "要删除", occurredAt: 1, now: 1 });
    await createEntry(db, { content: "保留", occurredAt: 2, now: 2 });
    await deleteEntry(db, entry.id);

    expect((await listTimeline(db, { pinned: false })).items.map((e) => e.content)).toEqual([
      "保留",
    ]);
  });
});

describe("listEntriesBetween", () => {
  it("使用半开区间 [start, end)", async () => {
    for (const ts of [100, 150, 200, 250]) {
      await createEntry(db, { content: `ts-${ts}`, occurredAt: ts, now: ts });
    }

    const items = await listEntriesBetween(db, 100, 200);
    expect(items.map((entry) => entry.occurredAt).sort((a, b) => a - b)).toEqual([100, 150]);
  });
});

describe("listEntriesForDay", () => {
  it("只返回指定本地日期，按发生时间倒序且跳过软删除", async () => {
    await createEntry(db, {
      content: "当天早",
      occurredAt: at(2026, 11, 17, 8, 0),
      now: NOW,
    });
    await createEntry(db, {
      content: "当天晚",
      occurredAt: at(2026, 11, 17, 22, 0),
      now: NOW,
    });
    await createEntry(db, {
      content: "前一天",
      occurredAt: at(2026, 11, 16, 23, 59),
      now: NOW,
    });
    const deleted = await createEntry(db, {
      content: "当天已删",
      occurredAt: at(2026, 11, 17, 12, 0),
      now: NOW,
    });
    await deleteEntry(db, deleted.entry.id);

    const items = await listEntriesForDay(db, at(2026, 11, 17, 15, 0));

    expect(items.map((entry) => entry.content)).toEqual(["当天晚", "当天早"]);
  });
});

describe("listEntriesByTag", () => {
  it("未知标签返回空结果", async () => {
    expect(await listEntriesByTag(db, "不存在")).toEqual({
      items: [],
      nextCursor: null,
      tagId: null,
    });
  });

  it("按标签筛选并过滤软删除后补足页长", async () => {
    const ids: string[] = [];
    for (let index = 1; index <= 4; index += 1) {
      const { entry } = await createEntry(db, {
        content: `#健康 第 ${index} 条`,
        occurredAt: index,
        now: index,
      });
      ids.push(entry.id);
    }
    await createEntry(db, { content: "无关", occurredAt: 99, now: 99 });
    const newestId = ids.at(-1);
    if (!newestId) throw new Error("缺少测试数据");
    await deleteEntry(db, newestId);

    const first = await listEntriesByTag(db, "健康", { limit: 2 });
    expect(first.items.map((entry) => entry.occurredAt)).toEqual([3, 2]);
    expect(first.tagId).not.toBeNull();
    expect(first.nextCursor).toEqual({ occurredAt: 2, entryId: first.items[1]?.id });

    const second = await listEntriesByTag(db, "健康", {
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(second.items.map((entry) => entry.occurredAt)).toEqual([1]);
    expect(second.nextCursor).toBeNull();
  });

  it("标签查询不区分大小写", async () => {
    await createEntry(db, { content: "#Health 打卡", occurredAt: 1, now: 1 });

    const page = await listEntriesByTag(db, "HEALTH");
    expect(page.items).toHaveLength(1);
  });
});

describe("listPinnedEntries", () => {
  it("只返回未删除的置顶条目，按发生时间倒序", async () => {
    await createEntry(db, { content: "普通", occurredAt: 9, now: 9 });
    await createEntry(db, { content: "置顶旧", occurredAt: 1, now: 1, pinned: 1 });
    const deleted = await createEntry(db, {
      content: "置顶已删",
      occurredAt: 2,
      now: 2,
      pinned: 1,
    });
    await createEntry(db, { content: "置顶新", occurredAt: 3, now: 3, pinned: 1 });
    await deleteEntry(db, deleted.entry.id);

    expect((await listPinnedEntries(db)).map((entry) => entry.content)).toEqual([
      "置顶新",
      "置顶旧",
    ]);
  });
});

describe("listMetricValuesForEntries", () => {
  it("一次取回多条记录的指标并按名称排序", async () => {
    await createMetric(db, { name: "体重", unit: "kg" }, 1);
    await createMetric(db, { name: "花费", unit: "元" }, 2);
    const first = await createEntry(db, {
      content: "体重 70kg 花费 30元",
      occurredAt: 1,
      now: 1,
    });
    const second = await createEntry(db, { content: "体重 71kg", occurredAt: 2, now: 2 });
    const third = await createEntry(db, { content: "没有指标", occurredAt: 3, now: 3 });

    const grouped = await listMetricValuesForEntries(db, [
      first.entry.id,
      second.entry.id,
      third.entry.id,
    ]);

    expect(grouped.get(first.entry.id)?.map((row) => row.nameSnapshot)).toEqual(["体重", "花费"]);
    expect(grouped.get(second.entry.id)).toHaveLength(1);
    expect(grouped.get(third.entry.id)).toBeUndefined();
  });

  it("空数组不发查询", async () => {
    expect(await listMetricValuesForEntries(db, [])).toEqual(new Map());
  });
});

describe("searchEntries", () => {
  it("按正文不区分大小写搜索，并按时间倒序", async () => {
    await createEntry(db, { content: "今天开会", occurredAt: 1, now: 1 });
    await createEntry(db, { content: "Meeting 记录", occurredAt: 2, now: 2 });
    await createEntry(db, { content: "无关", occurredAt: 3, now: 3 });

    const meeting = await searchEntries(db, "MEET");
    expect(meeting.map((entry) => entry.content)).toEqual(["Meeting 记录"]);

    const all = await searchEntries(db, "记");
    expect(all.map((entry) => entry.content)).toEqual(["Meeting 记录"]);
  });

  it("匹配标签名，且正文与标签同时命中只返回一次", async () => {
    const tagged = await createEntry(db, { content: "跑步", occurredAt: 1, now: 1 });
    const tagId = crypto.randomUUID();
    await db.tags.add({ id: tagId, name: "健康" });
    await db.entryTags.add({ entryId: tagged.entry.id, tagId, occurredAt: 1 });

    const both = await createEntry(db, { content: "#健康 早睡", occurredAt: 2, now: 2 });

    const result = await searchEntries(db, "健康");
    expect(result.map((entry) => entry.id).sort()).toEqual(
      [tagged.entry.id, both.entry.id].sort(),
    );
  });

  it("跳过软删除条目，忽略空关键词", async () => {
    const { entry } = await createEntry(db, { content: "要删掉的关键词", occurredAt: 1, now: 1 });
    await deleteEntry(db, entry.id);

    expect(await searchEntries(db, "关键词")).toEqual([]);
    expect(await searchEntries(db, "   ")).toEqual([]);
  });

  it("支持限制返回条数", async () => {
    for (let index = 1; index <= 3; index += 1) {
      await createEntry(db, { content: `开会 ${index}`, occurredAt: index, now: index });
    }

    expect(
      (await searchEntries(db, "开会", { limit: 2 })).map((entry) => entry.occurredAt),
    ).toEqual([3, 2]);
  });
});

describe("countEntries", () => {
  it("只统计未删除条目", async () => {
    const first = await createEntry(db, { content: "一", occurredAt: 1, now: 1 });
    await createEntry(db, { content: "二", occurredAt: 2, now: 2 });
    await deleteEntry(db, first.entry.id);

    expect(await countEntries(db)).toBe(1);
  });
});
