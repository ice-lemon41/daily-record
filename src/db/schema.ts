import type { EntryExtra } from "../domain/types";

export interface EntryRow {
  id: string;
  content: string;
  /** UTC 毫秒。 */
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
  /** IndexedDB 不索引 boolean，内部统一用 0/1。 */
  pinned: 0 | 1;
  /** 0 = 未删除；IndexedDB 不索引 null。 */
  deletedAt: number;
  extra: EntryExtra;
}

export interface TagRow {
  id: string;
  /** 存储时英文已转小写；中文原样。 */
  name: string;
}

export interface EntryTagRow {
  entryId: string;
  tagId: string;
  /** 冗余列：标签筛选按时间分页时用。 */
  occurredAt: number;
}

export interface MetricRow {
  id: string;
  name: string;
  /** 唯一索引，实现「不区分大小写不可重复」。 */
  nameLower: string;
  unit: string;
  archived: 0 | 1;
  createdAt: number;
}

export interface EntryMetricRow {
  id: string;
  entryId: string;
  metricId: string;
  /** 写入时的名称快照，仅内部使用，不导出。 */
  nameSnapshot: string;
  value: number;
  /** 写入时的单位快照。 */
  unit: string;
  raw: string;
}

export interface KvRow {
  key: string;
  value: unknown;
}
