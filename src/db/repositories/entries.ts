import { DRAFT_KV_KEY, PAGE_SIZE } from "../../domain/constants";
import {
  filterIgnoredSuggestions,
  type MetricDefinition,
  type MetricSuggestion,
  parseMetrics,
  suggestMetrics,
} from "../../domain/parse-metrics";
import { parseTags } from "../../domain/parse-tags";
import { type EntryExtra, emptyExtra } from "../../domain/types";
import { type AppDb, DAY_INDEX, TAG_TIMELINE_INDEX, TIMELINE_INDEX } from "../db";
import type { EntryMetricRow, EntryRow, EntryTagRow, MetricRow } from "../schema";
import { gcOrphanTags, upsertTags } from "./tags";

/** 复合索引分页上界，比任何 UUID 字符串都大。 */
const MAX_KEY_STRING = "\uffff";

export class EmptyContentError extends Error {
  constructor() {
    super("正文为空，不能保存");
    this.name = "EmptyContentError";
  }
}

export class EntryNotFoundError extends Error {
  constructor() {
    super("记录不存在");
    this.name = "EntryNotFoundError";
  }
}

export interface TimelineCursor {
  occurredAt: number;
  createdAt: number;
  id: string;
}

export interface TimelinePage {
  items: EntryRow[];
  nextCursor: TimelineCursor | null;
}

export interface CreateEntryInput {
  content: string;
  occurredAt: number;
  pinned?: 0 | 1;
  extra?: EntryExtra;
  now?: number;
}

export interface UpdateEntryInput {
  content?: string;
  occurredAt?: number;
  pinned?: 0 | 1;
  extra?: EntryExtra;
}

export interface SaveEntryResult {
  entry: EntryRow;
  suggestions: MetricSuggestion[];
}

function toDefinition(metric: MetricRow): MetricDefinition {
  return { id: metric.id, name: metric.name, unit: metric.unit };
}

function toEntryMetricRows(entryId: string, metrics: ReturnType<typeof parseMetrics>) {
  return metrics.map<EntryMetricRow>((metric) => ({
    id: crypto.randomUUID(),
    entryId,
    metricId: metric.metricId,
    nameSnapshot: metric.name,
    value: metric.value,
    unit: metric.unit,
    raw: metric.raw,
  }));
}

/**
 * 重建时的解析定义 = 当前启用的指标 + 该条目已有的历史别名
 * （改名/改单位后，旧正文仍能按当时的名称与单位命中，PRD FR-09-3/4）。
 */
async function buildDefinitions(db: AppDb, entryId?: string): Promise<MetricDefinition[]> {
  const metrics = await db.metrics.toArray();
  const definitions = metrics.filter((metric) => metric.archived === 0).map(toDefinition);

  if (entryId) {
    const existing = await db.entryMetrics.where("entryId").equals(entryId).toArray();
    for (const row of existing) {
      definitions.push({ id: row.metricId, name: row.nameSnapshot, unit: row.unit });
    }
  }

  return definitions;
}

async function writeDerived(
  db: AppDb,
  entry: EntryRow,
  definitions: MetricDefinition[],
): Promise<void> {
  const parsedTags = parseTags(entry.content);
  const parsedMetrics = parseMetrics(entry.content, definitions);

  const tagRows = await upsertTags(
    db,
    parsedTags.map((tag) => tag.name),
  );

  await db.entryTags.bulkPut(
    tagRows.map<EntryTagRow>((tag) => ({
      entryId: entry.id,
      tagId: tag.id,
      occurredAt: entry.occurredAt,
    })),
  );

  await db.entryMetrics.bulkPut(toEntryMetricRows(entry.id, parsedMetrics));
}

export async function createEntry(db: AppDb, input: CreateEntryInput): Promise<SaveEntryResult> {
  if (input.content.trim().length === 0) throw new EmptyContentError();

  const now = input.now ?? Date.now();
  const entry: EntryRow = {
    id: crypto.randomUUID(),
    content: input.content,
    occurredAt: input.occurredAt,
    createdAt: now,
    updatedAt: now,
    pinned: input.pinned ?? 0,
    deletedAt: 0,
    extra: input.extra ?? emptyExtra(),
  };

  const definitions = await buildDefinitions(db);
  const parsedMetrics = parseMetrics(entry.content, definitions);
  const suggestions = filterIgnoredSuggestions(
    suggestMetrics(entry.content, definitions, parsedMetrics),
    entry.extra.ignoredSuggestions,
  );

  await db.transaction(
    "rw",
    db.entries,
    db.tags,
    db.entryTags,
    db.entryMetrics,
    db.kv,
    async () => {
      await db.entries.add(entry);
      await writeDerived(db, entry, definitions);
      await db.kv.delete(DRAFT_KV_KEY);
    },
  );

  return { entry, suggestions };
}

export async function updateEntry(
  db: AppDb,
  id: string,
  patch: UpdateEntryInput,
  now = Date.now(),
): Promise<SaveEntryResult> {
  const existing = await db.entries.get(id);
  if (existing?.deletedAt !== 0) throw new EntryNotFoundError();

  const content = patch.content ?? existing.content;
  if (content.trim().length === 0) throw new EmptyContentError();

  const updated: EntryRow = {
    ...existing,
    content,
    occurredAt: patch.occurredAt ?? existing.occurredAt,
    pinned: patch.pinned ?? existing.pinned,
    extra: patch.extra ?? existing.extra,
    updatedAt: now,
  };

  const definitions = await buildDefinitions(db, id);
  const parsedMetrics = parseMetrics(content, definitions);
  const suggestions = filterIgnoredSuggestions(
    suggestMetrics(content, definitions, parsedMetrics),
    updated.extra.ignoredSuggestions,
  );

  await db.transaction("rw", db.entries, db.tags, db.entryTags, db.entryMetrics, async () => {
    await db.entries.put(updated);
    await db.entryTags.where("entryId").equals(id).delete();
    await db.entryMetrics.where("entryId").equals(id).delete();
    await writeDerived(db, updated, definitions);
    await gcOrphanTags(db);
  });

  return { entry: updated, suggestions };
}

export async function getEntry(db: AppDb, id: string): Promise<EntryRow | undefined> {
  const entry = await db.entries.get(id);
  return entry && entry.deletedAt === 0 ? entry : undefined;
}

export async function deleteEntry(db: AppDb, id: string, now = Date.now()): Promise<EntryRow> {
  const existing = await db.entries.get(id);
  if (existing?.deletedAt !== 0) throw new EntryNotFoundError();

  const updated: EntryRow = { ...existing, deletedAt: now, updatedAt: now };
  await db.entries.put(updated);
  return updated;
}

export async function restoreEntry(db: AppDb, id: string, now = Date.now()): Promise<EntryRow> {
  const existing = await db.entries.get(id);
  if (!existing) throw new EntryNotFoundError();

  const updated: EntryRow = { ...existing, deletedAt: 0, updatedAt: now };
  await db.entries.put(updated);
  return updated;
}

/** 时间线：先取置顶区，再取日期分组；游标保证同一毫秒也能稳定分页。 */
export async function listTimeline(
  db: AppDb,
  options: { pinned: boolean; cursor?: TimelineCursor | null; limit?: number },
): Promise<TimelinePage> {
  const limit = options.limit ?? PAGE_SIZE;
  const pinned = options.pinned ? 1 : 0;
  const upper: [number, number, number, number, string] = options.cursor
    ? [0, pinned, options.cursor.occurredAt, options.cursor.createdAt, options.cursor.id]
    : [0, pinned, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, MAX_KEY_STRING];

  const items = await db.entries
    .where(TIMELINE_INDEX)
    .between(
      [0, pinned, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, ""],
      upper,
      true,
      false,
    )
    .reverse()
    .limit(limit)
    .toArray();

  const last = items.at(-1);
  const nextCursor =
    items.length === limit && last
      ? { occurredAt: last.occurredAt, createdAt: last.createdAt, id: last.id }
      : null;

  return { items, nextCursor };
}

/** 置顶区不分页（PRD FR-05-3），直接走复合索引取全部。 */
export async function listPinnedEntries(db: AppDb): Promise<EntryRow[]> {
  return db.entries
    .where(TIMELINE_INDEX)
    .between(
      [0, 1, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, ""],
      [0, 1, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, MAX_KEY_STRING],
      true,
      false,
    )
    .reverse()
    .toArray();
}

/** 时间线条目的指标摘要，一次批量取回，避免每张卡片各查一次。 */
export async function listMetricValuesForEntries(
  db: AppDb,
  entryIds: string[],
): Promise<Map<string, EntryMetricRow[]>> {
  const grouped = new Map<string, EntryMetricRow[]>();
  if (entryIds.length === 0) return grouped;

  const rows = await db.entryMetrics.where("entryId").anyOf(entryIds).toArray();
  for (const row of rows) {
    const list = grouped.get(row.entryId) ?? [];
    list.push(row);
    grouped.set(row.entryId, list);
  }

  for (const list of grouped.values()) {
    list.sort((a, b) =>
      a.nameSnapshot < b.nameSnapshot
        ? -1
        : a.nameSnapshot > b.nameSnapshot
          ? 1
          : a.value - b.value,
    );
  }

  return grouped;
}

/** 关键词搜索：正文不区分大小写。10k 基准见 src/db/bench。 */
export async function searchEntries(
  db: AppDb,
  keyword: string,
  options: { limit?: number } = {},
): Promise<EntryRow[]> {
  const needle = keyword.trim().toLowerCase();
  if (needle.length === 0) return [];

  // 不用 Dexie 的 Collection.filter：fake-indexeddb 下 10k 条会退化成分钟级；
  // 直接取回后内存过滤，10k 实测约 50ms（见 src/db/bench）。
  const rows = await db.entries.where("deletedAt").equals(0).toArray();
  const items = rows.filter((entry) => entry.content.toLowerCase().includes(needle));

  items.sort(
    (a, b) => b.occurredAt - a.occurredAt || b.createdAt - a.createdAt || b.id.localeCompare(a.id),
  );

  return options.limit ? items.slice(0, options.limit) : items;
}

/** 日历 / 按天筛选 / 补记：半开区间 [start, end)。 */
export async function listEntriesBetween(
  db: AppDb,
  start: number,
  endExclusive: number,
): Promise<EntryRow[]> {
  return db.entries.where(DAY_INDEX).between([0, start], [0, endExclusive], true, false).toArray();
}

export interface TagCursor {
  occurredAt: number;
  entryId: string;
}

export interface TagTimelinePage {
  items: EntryRow[];
  nextCursor: TagCursor | null;
  tagId: string | null;
}

/** 标签筛选：走 [tagId+occurredAt+entryId] 游标分页，过滤软删除后补足 limit。 */
export async function listEntriesByTag(
  db: AppDb,
  tagName: string,
  options: { cursor?: TagCursor | null; limit?: number } = {},
): Promise<TagTimelinePage> {
  const limit = options.limit ?? PAGE_SIZE;
  const tag = await db.tags.where("name").equals(tagName.toLowerCase()).first();
  if (!tag) return { items: [], nextCursor: null, tagId: null };

  const items: EntryRow[] = [];
  let upper: [string, number, string] = options.cursor
    ? [tag.id, options.cursor.occurredAt, options.cursor.entryId]
    : [tag.id, Number.POSITIVE_INFINITY, MAX_KEY_STRING];
  let lastScanned: TagCursor | null = null;

  while (items.length < limit) {
    const remaining = limit - items.length;
    const batch = await db.entryTags
      .where(TAG_TIMELINE_INDEX)
      .between([tag.id, Number.NEGATIVE_INFINITY, ""], upper, true, false)
      .reverse()
      .limit(remaining)
      .toArray();

    if (batch.length === 0) break;

    const last = batch.at(-1);
    if (last) upper = [tag.id, last.occurredAt, last.entryId];

    const entries = await db.entries.bulkGet(batch.map((row) => row.entryId));

    for (let index = 0; index < batch.length; index += 1) {
      const row = batch[index];
      const entry = entries[index];
      if (!row) continue;
      lastScanned = { occurredAt: row.occurredAt, entryId: row.entryId };
      if (entry && entry.deletedAt === 0) items.push(entry);
      if (items.length >= limit) break;
    }

    if (batch.length < remaining) break;
    if (items.length >= limit) break;
  }

  return {
    items,
    nextCursor: items.length === limit ? lastScanned : null,
    tagId: tag.id,
  };
}

export async function countEntries(db: AppDb): Promise<number> {
  return db.entries.where("deletedAt").equals(0).count();
}
