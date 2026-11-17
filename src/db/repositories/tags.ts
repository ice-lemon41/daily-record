import type { AppDb } from "../db";
import type { TagRow } from "../schema";

/** 标签的存储键：英文小写、中文原样（PRD FR-03-4）。 */
export function normalizeTagName(name: string): string {
  return name.toLowerCase();
}

/**
 * 在事务内按 name 复用或新建标签。
 * 调用方负责保证在 Dexie 事务内执行。
 */
export async function upsertTags(db: AppDb, names: ReadonlyArray<string>): Promise<TagRow[]> {
  const unique = new Map<string, string>();
  for (const name of names) {
    const key = normalizeTagName(name);
    if (key.length > 0 && !unique.has(key)) unique.set(key, key);
  }

  const rows: TagRow[] = [];
  for (const storedName of unique.values()) {
    const existing = await db.tags.where("name").equals(storedName).first();
    if (existing) {
      rows.push(existing);
      continue;
    }
    const row: TagRow = { id: crypto.randomUUID(), name: storedName };
    await db.tags.add(row);
    rows.push(row);
  }

  return rows;
}

/**
 * 删除没有任何条目引用的标签（PRD FR-03-7）。
 * 调用方负责保证在 Dexie 事务内执行。
 */
export async function gcOrphanTags(db: AppDb): Promise<number> {
  const tags = await db.tags.toArray();
  let removed = 0;

  for (const tag of tags) {
    const references = await db.entryTags.where("tagId").equals(tag.id).count();
    if (references === 0) {
      await db.tags.delete(tag.id);
      removed += 1;
    }
  }

  return removed;
}
