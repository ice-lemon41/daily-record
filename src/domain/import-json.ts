import { z } from "zod";
import { APP_ID, SCHEMA_VERSION } from "./constants";
import type { ExportBundle } from "./types";

const ignoredSuggestionSchema = z.object({
  name: z.string().min(1),
  unit: z.string(),
  value: z.number(),
  raw: z.string(),
  ignoredAt: z.int(),
});

const entryExtraSchema = z
  .object({
    ignoredSuggestions: z.array(ignoredSuggestionSchema).default([]),
  })
  .default({ ignoredSuggestions: [] });

const exportEntrySchema = z.object({
  id: z.uuid(),
  content: z.string(),
  occurredAt: z.int(),
  createdAt: z.int(),
  updatedAt: z.int(),
  pinned: z.boolean(),
  extra: entryExtraSchema,
});

const exportMetricSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  unit: z.string(),
  archived: z.boolean(),
  createdAt: z.int(),
});

const bundleSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  app: z.literal(APP_ID),
  exportedAt: z.int(),
  metrics: z.array(exportMetricSchema),
  entries: z.array(exportEntrySchema),
});

export interface ImportStats {
  entries: number;
  metrics: number;
  /** 最早 / 最晚 occurredAt；没有条目时为 null。 */
  from: number | null;
  to: number | null;
}

export type ImportFailureCode =
  | "invalid-json"
  | "invalid-version"
  | "invalid-shape"
  | "duplicate-id";

export interface ImportFailure {
  ok: false;
  code: ImportFailureCode;
  message: string;
  path?: string;
}

export type ImportResult = { ok: true; bundle: ExportBundle; stats: ImportStats } | ImportFailure;

/**
 * 纯校验与转换：不写库、不读库。
 * 导入必须是「全部成功或全部不做」（PRD FR-10-3）。
 */
export function parseImportJson(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, code: "invalid-json", message: "文件内容损坏，无法解析" };
  }

  if (typeof raw === "object" && raw !== null && "schemaVersion" in raw) {
    const version = (raw as { schemaVersion: unknown }).schemaVersion;
    if (version !== SCHEMA_VERSION) {
      return {
        ok: false,
        code: "invalid-version",
        message: `备份的 schemaVersion 为 ${String(version)}，当前应用只支持 ${SCHEMA_VERSION}`,
        path: "schemaVersion",
      };
    }
  }

  const parsed = bundleSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".") || "根对象";
    return {
      ok: false,
      code: "invalid-shape",
      message: `备份文件不完整：${path} 无效`,
      path,
    };
  }

  const entryIds = new Set<string>();
  for (const entry of parsed.data.entries) {
    if (entryIds.has(entry.id)) {
      return {
        ok: false,
        code: "duplicate-id",
        message: `备份文件里有重复的条目 ID：${entry.id}`,
        path: "entries.id",
      };
    }
    entryIds.add(entry.id);
  }

  const metricIds = new Set<string>();
  for (const metric of parsed.data.metrics) {
    if (metricIds.has(metric.id)) {
      return {
        ok: false,
        code: "duplicate-id",
        message: `备份文件里有重复的指标 ID：${metric.id}`,
        path: "metrics.id",
      };
    }
    metricIds.add(metric.id);
  }

  const times = parsed.data.entries.map((entry) => entry.occurredAt);
  const stats: ImportStats = {
    entries: parsed.data.entries.length,
    metrics: parsed.data.metrics.length,
    from: times.length > 0 ? Math.min(...times) : null,
    to: times.length > 0 ? Math.max(...times) : null,
  };

  return { ok: true, bundle: parsed.data as ExportBundle, stats };
}
