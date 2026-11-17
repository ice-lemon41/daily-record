import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { type AppDb, createDb, DAY_INDEX, TAG_TIMELINE_INDEX, TIMELINE_INDEX } from "./db";

const opened: AppDb[] = [];

function makeDb(name = `test-${crypto.randomUUID()}`): AppDb {
  const db = createDb(name);
  opened.push(db);
  return db;
}

afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close();
    await Dexie.delete(db.name);
  }
});

describe("createDb", () => {
  it("使用 schemaVersion 1 与六张表", () => {
    const db = makeDb();

    expect(db.verno).toBe(1);
    expect(db.tables.map((table) => table.name).sort()).toEqual([
      "entries",
      "entryMetrics",
      "entryTags",
      "kv",
      "metrics",
      "tags",
    ]);
  });

  it("entries 具备时间线与日历索引", () => {
    const db = makeDb();
    const indexes = db.table("entries").schema.indexes.map((index) => index.name);

    expect(indexes).toEqual(
      expect.arrayContaining([
        "occurredAt",
        "createdAt",
        "pinned",
        "deletedAt",
        DAY_INDEX,
        TIMELINE_INDEX,
      ]),
    );
  });

  it("entryTags 具备标签分页索引", () => {
    const db = makeDb();
    const table = db.table("entryTags");
    const indexes = table.schema.indexes.map((index) => index.name);

    expect(table.schema.primKey.name).toBe("[entryId+tagId]");
    expect(indexes).toEqual(expect.arrayContaining(["entryId", "tagId", TAG_TIMELINE_INDEX]));
  });

  it("tags.name 与 metrics.nameLower 唯一", () => {
    const db = makeDb();
    const tagName = db.table("tags").schema.indexes.find((index) => index.name === "name");
    const metricName = db
      .table("metrics")
      .schema.indexes.find((index) => index.name === "nameLower");

    expect(tagName?.unique).toBe(true);
    expect(metricName?.unique).toBe(true);
  });

  it("不同数据库名互不共享数据", async () => {
    const first = makeDb();
    const second = makeDb();

    await first.entries.add({
      id: crypto.randomUUID(),
      content: "第一条",
      occurredAt: 1,
      createdAt: 1,
      updatedAt: 1,
      pinned: 0,
      deletedAt: 0,
      extra: { ignoredSuggestions: [] },
    });

    expect(await first.entries.count()).toBe(1);
    expect(await second.entries.count()).toBe(0);
  });

  it("重新打开同名数据库后数据仍在", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const first = createDb(name);
    const id = crypto.randomUUID();

    await first.entries.add({
      id,
      content: "持久化",
      occurredAt: 1,
      createdAt: 1,
      updatedAt: 1,
      pinned: 0,
      deletedAt: 0,
      extra: { ignoredSuggestions: [] },
    });
    first.close();

    const second = createDb(name);
    expect(await second.entries.get(id)).toMatchObject({ content: "持久化" });
    second.close();

    await Dexie.delete(name);
  });
});
