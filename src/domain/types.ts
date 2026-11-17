// biome-ignore lint/style/useImportType: typeof SCHEMA_VERSION 需要值导入
import { SCHEMA_VERSION } from "./constants";

export interface IgnoredSuggestion {
  name: string;
  unit: string;
  value: number;
  raw: string;
  /** UTC 毫秒。 */
  ignoredAt: number;
}

export interface EntryExtra {
  ignoredSuggestions: IgnoredSuggestion[];
}

/** PRD §8.3 的导出格式；pinned / archived 在 JSON 里是布尔值。 */
export interface ExportEntry {
  id: string;
  content: string;
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  extra: EntryExtra;
}

export interface ExportMetric {
  id: string;
  name: string;
  unit: string;
  archived: boolean;
  createdAt: number;
}

export interface ExportBundle {
  schemaVersion: typeof SCHEMA_VERSION;
  app: "daily-record";
  exportedAt: number;
  metrics: ExportMetric[];
  entries: ExportEntry[];
}

export function emptyExtra(): EntryExtra {
  return { ignoredSuggestions: [] };
}
