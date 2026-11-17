import { MAX_METRIC_NAME_LENGTH, MAX_METRIC_UNIT_LENGTH } from "../../domain/constants";
import type { AppDb } from "../db";
import type { MetricRow } from "../schema";

export class MetricValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetricValidationError";
  }
}

export class MetricNameConflictError extends Error {
  constructor(name: string) {
    super(`指标「${name}」已存在`);
    this.name = "MetricNameConflictError";
  }
}

export interface MetricInput {
  name: string;
  unit: string;
}

export interface NormalizedMetricInput {
  name: string;
  nameLower: string;
  unit: string;
}

/** PRD FR-09-2：名称 1–10 字符、去首尾空白、不含 #；单位 0–6 字符。 */
export function normalizeMetricInput(input: MetricInput): NormalizedMetricInput {
  const name = input.name.trim();
  const unit = input.unit.trim();

  if (name.length === 0) {
    throw new MetricValidationError("指标名称不能为空");
  }
  if ([...name].length > MAX_METRIC_NAME_LENGTH) {
    throw new MetricValidationError(`指标名称最多 ${MAX_METRIC_NAME_LENGTH} 个字符`);
  }
  if (name.includes("#")) {
    throw new MetricValidationError("指标名称不能包含 #");
  }
  if ([...unit].length > MAX_METRIC_UNIT_LENGTH) {
    throw new MetricValidationError(`单位最多 ${MAX_METRIC_UNIT_LENGTH} 个字符`);
  }

  return { name, nameLower: name.toLowerCase(), unit };
}

export async function listMetrics(
  db: AppDb,
  options: { includeArchived?: boolean } = {},
): Promise<MetricRow[]> {
  const metrics = await db.metrics.toArray();
  return metrics
    .filter((metric) => options.includeArchived === true || metric.archived === 0)
    .sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name));
}

export async function createMetric(
  db: AppDb,
  input: MetricInput,
  now = Date.now(),
): Promise<MetricRow> {
  const normalized = normalizeMetricInput(input);
  const existing = await db.metrics.where("nameLower").equals(normalized.nameLower).first();
  if (existing) throw new MetricNameConflictError(normalized.name);

  const row: MetricRow = {
    id: crypto.randomUUID(),
    name: normalized.name,
    nameLower: normalized.nameLower,
    unit: normalized.unit,
    archived: 0,
    createdAt: now,
  };

  try {
    await db.metrics.add(row);
  } catch (error) {
    // 并发兜底：唯一索引冲突同样视为重名
    if (error instanceof Error && error.name === "ConstraintError") {
      throw new MetricNameConflictError(normalized.name);
    }
    throw error;
  }

  return row;
}

export async function updateMetric(
  db: AppDb,
  id: string,
  patch: Partial<MetricInput>,
): Promise<MetricRow> {
  const existing = await db.metrics.get(id);
  if (!existing) throw new MetricValidationError("指标不存在");

  const name = patch.name ?? existing.name;
  const unit = patch.unit ?? existing.unit;
  const normalized = normalizeMetricInput({ name, unit });

  const clash = await db.metrics.where("nameLower").equals(normalized.nameLower).first();
  if (clash && clash.id !== id) throw new MetricNameConflictError(normalized.name);

  const updated: MetricRow = {
    ...existing,
    name: normalized.name,
    nameLower: normalized.nameLower,
    unit: normalized.unit,
  };

  try {
    await db.metrics.put(updated);
  } catch (error) {
    if (error instanceof Error && error.name === "ConstraintError") {
      throw new MetricNameConflictError(normalized.name);
    }
    throw error;
  }

  return updated;
}

export async function archiveMetric(db: AppDb, id: string, archived = true): Promise<MetricRow> {
  const existing = await db.metrics.get(id);
  if (!existing) throw new MetricValidationError("指标不存在");

  const updated: MetricRow = { ...existing, archived: archived ? 1 : 0 };
  await db.metrics.put(updated);
  return updated;
}
