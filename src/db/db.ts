import Dexie, { type EntityTable, type Table } from "dexie";
import type { EntryMetricRow, EntryRow, EntryTagRow, KvRow, MetricRow, TagRow } from "./schema";

export type AppDb = Dexie & {
  entries: EntityTable<EntryRow, "id">;
  tags: EntityTable<TagRow, "id">;
  entryTags: Table<EntryTagRow, [string, string]>;
  metrics: EntityTable<MetricRow, "id">;
  entryMetrics: EntityTable<EntryMetricRow, "id">;
  kv: EntityTable<KvRow, "key">;
};

export const TIMELINE_INDEX = "[deletedAt+pinned+occurredAt+createdAt+id]";
export const DAY_INDEX = "[deletedAt+occurredAt]";
export const TAG_TIMELINE_INDEX = "[tagId+occurredAt+entryId]";

export function createDb(name = "daily-record"): AppDb {
  const db = new Dexie(name) as AppDb;

  db.version(1).stores({
    entries: `id, occurredAt, createdAt, pinned, deletedAt, ${DAY_INDEX}, ${TIMELINE_INDEX}`,
    tags: "id, &name",
    entryTags: `[entryId+tagId], entryId, tagId, ${TAG_TIMELINE_INDEX}`,
    metrics: "id, &nameLower, archived",
    entryMetrics: "id, &[entryId+metricId], entryId, metricId",
    kv: "key",
  });

  return db;
}

export const db = createDb();
