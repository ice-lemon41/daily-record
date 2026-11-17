import { dateKey, formatClock, weekdayLabel } from "./dates";
import type { EntryExtra } from "./types";

export interface MarkdownEntry {
  id: string;
  content: string;
  occurredAt: number;
  createdAt: number;
  deletedAt?: number;
  extra?: Partial<EntryExtra>;
}

export interface MarkdownMetricValue {
  entryId: string;
  nameSnapshot: string;
  value: number;
  unit: string;
}

export interface MarkdownSource {
  entries: MarkdownEntry[];
  metricValues: MarkdownMetricValue[];
  exportedAt: number;
}

function formatMetric(value: MarkdownMetricValue): string {
  const unit = value.unit ? ` ${value.unit}` : "";
  return `  - ${value.nameSnapshot} ${value.value}${unit}`;
}

/**
 * 可读备份：按本地日期分组，只用于阅读与归档，不支持导入（PRD FR-10-2）。
 */
export function toMarkdown(source: MarkdownSource): string {
  const visible = source.entries
    .filter((entry) => (entry.deletedAt ?? 0) === 0)
    .sort((a, b) => b.occurredAt - a.occurredAt || b.createdAt - a.createdAt);

  const valuesByEntry = new Map<string, MarkdownMetricValue[]>();
  for (const value of source.metricValues) {
    const list = valuesByEntry.get(value.entryId) ?? [];
    list.push(value);
    valuesByEntry.set(value.entryId, list);
  }

  const lines: string[] = [
    "# 日常记录",
    "",
    `> 导出时间：${dateKey(source.exportedAt)} ${formatClock(source.exportedAt)}`,
    "",
  ];

  let currentDate = "";

  for (const entry of visible) {
    const key = dateKey(entry.occurredAt);
    if (key !== currentDate) {
      if (currentDate !== "") lines.push("");
      lines.push(`## ${key} ${weekdayLabel(entry.occurredAt)}`, "");
      currentDate = key;
    }

    const contentLines = entry.content.split(/\r?\n/);
    const [first = "", ...rest] = contentLines;
    lines.push(`- ${formatClock(entry.occurredAt)} ${first}`);
    for (const line of rest) {
      lines.push(`  ${line}`);
    }

    const values = (valuesByEntry.get(entry.id) ?? []).sort(
      (a, b) => a.nameSnapshot.localeCompare(b.nameSnapshot) || a.value - b.value,
    );
    for (const value of values) {
      lines.push(formatMetric(value));
    }
  }

  if (visible.length === 0) {
    lines.push("（没有记录）", "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
