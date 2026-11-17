import { DRAFT_KV_KEY, LAST_IMPORT_AT_KV_KEY, SCHEMA_VERSION_KV_KEY } from "../../domain/constants";
import type { ExportSource } from "../../domain/export-json";
import type { MarkdownSource } from "../../domain/export-markdown";
import { parseMetrics } from "../../domain/parse-metrics";
import { parseTags } from "../../domain/parse-tags";
import type { ExportBundle } from "../../domain/types";
import type { AppDb } from "../db";
import type { EntryMetricRow, EntryRow, EntryTagRow, MetricRow, TagRow } from "../schema";
import { setKv } from "./kv";

export class ImportDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportDataError";
  }
}

export interface ImportWriteSummary {
  entries: number;
  metrics: number;
  tags: number;
  metricValues: number;
}

interface ImportRows {
  metricRows: MetricRow[];
  entryRows: EntryRow[];
  tagRows: TagRow[];
  entryTagRows: EntryTagRow[];
  entryMetricRows: EntryMetricRow[];
}

/** 导出前的只读快照；deletedAt ≠ 0 的条目不会进入备份。 */
export async function loadExportSource(db: AppDb, exportedAt = Date.now()): Promise<ExportSource> {
  const [entries, metrics] = await Promise.all([
    db.entries.where("deletedAt").equals(0).toArray(),
    db.metrics.toArray(),
  ]);
  return { entries, metrics, exportedAt };
}

/** Markdown 导出快照：未删除条目 + 它们的指标快照。 */
export async function loadMarkdownSource(
  db: AppDb,
  exportedAt = Date.now(),
): Promise<MarkdownSource> {
  const entries = await db.entries.where("deletedAt").equals(0).toArray();
  const ids = entries.map((entry) => entry.id);
  const metricValues =
    ids.length === 0 ? [] : await db.entryMetrics.where("entryId").anyOf(ids).toArray();
  return { entries, metricValues, exportedAt };
}

/**
 * 把导入文件转换成内部行。所有解析在事务外完成，
 * 事务内只做清空与写入。
 */
function buildImportRows(bundle: ExportBundle): ImportRows {
  const definitions = bundle.metrics.map((metric) => ({
    id: metric.id,
    name: metric.name,
    unit: metric.unit,
  }));

  const metricRows = bundle.metrics.map<MetricRow>((metric) => ({
    id: metric.id,
    name: metric.name,
    nameLower: metric.name.toLowerCase(),
    unit: metric.unit,
    archived: metric.archived ? 1 : 0,
    createdAt: metric.createdAt,
  }));

  const tagIdByName = new Map<string, string>();
  const tagRows: TagRow[] = [];
  const entryRows: EntryRow[] = [];
  const entryTagRows: EntryTagRow[] = [];
  const entryMetricRows: EntryMetricRow[] = [];
  const entryTagKeys = new Set<string>();
  const entryIds = new Set<string>();

  for (const entry of bundle.entries) {
    if (entryIds.has(entry.id)) {
      throw new ImportDataError(`导入数据里有重复的条目 ID：${entry.id}`);
    }
    entryIds.add(entry.id);

    entryRows.push({
      id: entry.id,
      content: entry.content,
      occurredAt: entry.occurredAt,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      pinned: entry.pinned ? 1 : 0,
      deletedAt: 0,
      extra: {
        ignoredSuggestions: entry.extra.ignoredSuggestions.map((item) => ({ ...item })),
      },
    });

    for (const tag of parseTags(entry.content)) {
      let tagId = tagIdByName.get(tag.nameLower);
      if (!tagId) {
        tagId = crypto.randomUUID();
        tagIdByName.set(tag.nameLower, tagId);
        tagRows.push({ id: tagId, name: tag.nameLower });
      }

      const pairKey = `${entry.id}|${tagId}`;
      if (entryTagKeys.has(pairKey)) continue;
      entryTagKeys.add(pairKey);
      entryTagRows.push({ entryId: entry.id, tagId, occurredAt: entry.occurredAt });
    }

    for (const metric of parseMetrics(entry.content, definitions)) {
      entryMetricRows.push({
        id: crypto.randomUUID(),
        entryId: entry.id,
        metricId: metric.metricId,
        nameSnapshot: metric.name,
        value: metric.value,
        unit: metric.unit,
        raw: metric.raw,
      });
    }
  }

  return { metricRows, entryRows, tagRows, entryTagRows, entryMetricRows };
}

/**
 * 覆盖式导入：清空六张表后重建，全部成功或全部回滚。
 * 保留 lastExportAt 与设置项，只清草稿并写回 schemaVersion。
 */
export async function replaceAllData(
  db: AppDb,
  bundle: ExportBundle,
  now = Date.now(),
): Promise<ImportWriteSummary> {
  const rows = buildImportRows(bundle);

  await db.transaction(
    "rw",
    [db.entries, db.tags, db.entryTags, db.metrics, db.entryMetrics, db.kv],
    async () => {
      await db.entryMetrics.clear();
      await db.entryTags.clear();
      await db.entries.clear();
      await db.tags.clear();
      await db.metrics.clear();

      if (rows.metricRows.length > 0) await db.metrics.bulkPut(rows.metricRows);
      if (rows.entryRows.length > 0) await db.entries.bulkPut(rows.entryRows);
      if (rows.tagRows.length > 0) await db.tags.bulkPut(rows.tagRows);
      if (rows.entryTagRows.length > 0) await db.entryTags.bulkPut(rows.entryTagRows);
      if (rows.entryMetricRows.length > 0) {
        await db.entryMetrics.bulkPut(rows.entryMetricRows);
      }

      await db.kv.delete(DRAFT_KV_KEY);
      await setKv(db, SCHEMA_VERSION_KV_KEY, bundle.schemaVersion);
      await setKv(db, LAST_IMPORT_AT_KV_KEY, now);
    },
  );

  return {
    entries: rows.entryRows.length,
    metrics: rows.metricRows.length,
    tags: rows.tagRows.length,
    metricValues: rows.entryMetricRows.length,
  };
}
