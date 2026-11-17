import { APP_ID, EXPORT_FILE_PREFIX, SCHEMA_VERSION } from "./constants";
import { formatFileStamp } from "./dates";
import type { EntryExtra, ExportBundle, ExportEntry, ExportMetric } from "./types";

export interface ExportSourceEntry {
  id: string;
  content: string;
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
  /** 内部行是 0/1，领域层同时接受 boolean。 */
  pinned: 0 | 1 | boolean;
  deletedAt?: number;
  extra?: Partial<EntryExtra>;
}

export interface ExportSourceMetric {
  id: string;
  name: string;
  unit: string;
  archived: 0 | 1 | boolean;
  createdAt: number;
}

export interface ExportSource {
  entries: ExportSourceEntry[];
  metrics: ExportSourceMetric[];
  exportedAt: number;
}

function toBoolean(value: 0 | 1 | boolean): boolean {
  return value === true || value === 1;
}

function normalizeExtra(extra: Partial<EntryExtra> | undefined): EntryExtra {
  const ignoredSuggestions = (extra?.ignoredSuggestions ?? []).map((item) => ({
    name: item.name,
    unit: item.unit,
    value: item.value,
    raw: item.raw,
    ignoredAt: item.ignoredAt,
  }));
  return { ignoredSuggestions };
}

/**
 * 内部行 → PRD §8.3 的 JSON。字段映射必须显式完成：
 * 0/1 ↔ boolean、不导出 deletedAt、不导出派生数据。
 */
export function toExportBundle(source: ExportSource): ExportBundle {
  const entries: ExportEntry[] = source.entries
    .filter((entry) => (entry.deletedAt ?? 0) === 0)
    .map((entry) => ({
      id: entry.id,
      content: entry.content,
      occurredAt: entry.occurredAt,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      pinned: toBoolean(entry.pinned),
      extra: normalizeExtra(entry.extra),
    }))
    .sort(
      (a, b) =>
        a.occurredAt - b.occurredAt || a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    );

  const metrics: ExportMetric[] = source.metrics
    .map((metric) => ({
      id: metric.id,
      name: metric.name,
      unit: metric.unit,
      archived: toBoolean(metric.archived),
      createdAt: metric.createdAt,
    }))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

  return {
    schemaVersion: SCHEMA_VERSION,
    app: APP_ID,
    exportedAt: source.exportedAt,
    metrics,
    entries,
  };
}

export function exportFileName(kind: "json" | "md", ts: number): string {
  return `${EXPORT_FILE_PREFIX}-${formatFileStamp(ts)}.${kind}`;
}
