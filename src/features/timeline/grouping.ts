import type { EntryRow } from "../../db/schema";
import { dateKey, formatGroupTitle } from "../../domain/dates";

export interface TimelineGroup {
  key: string;
  title: string;
  items: EntryRow[];
}

/**
 * 输入已按 occurredAt 倒序排列的条目，按本地日期分组（PRD FR-05-2）。
 * 分组归属只看发生时间，不看创建时间。
 */
export function groupEntriesByDay(items: EntryRow[], now: number): TimelineGroup[] {
  const groups: TimelineGroup[] = [];

  for (const item of items) {
    const key = dateKey(item.occurredAt);
    const current = groups.at(-1);
    if (current?.key === key) {
      current.items.push(item);
      continue;
    }
    groups.push({ key, title: formatGroupTitle(item.occurredAt, now), items: [item] });
  }

  return groups;
}
