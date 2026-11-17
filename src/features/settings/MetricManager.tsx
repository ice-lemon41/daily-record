import { useLiveQuery } from "dexie-react-hooks";
import { type FormEvent, useId, useState } from "react";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import type { AppDb } from "../../db/db";
import {
  archiveMetric,
  createMetric,
  listMetrics,
  MetricNameConflictError,
  MetricValidationError,
  updateMetric,
} from "../../db/repositories/metrics";
import type { MetricRow } from "../../db/schema";

interface MetricManagerProps {
  database: AppDb;
}

function describeError(reason: unknown): string {
  if (reason instanceof MetricValidationError || reason instanceof MetricNameConflictError) {
    return reason.message;
  }
  return "保存失败，请重试";
}

/** 指标管理：新增、改名/改单位、归档与恢复（PRD FR-09）。 */
export function MetricManager({ database }: MetricManagerProps) {
  const { show } = useToast();
  const metrics = useLiveQuery(() => listMetrics(database, { includeArchived: true }), [database]);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MetricRow | null>(null);
  const nameId = useId();
  const unitId = useId();

  async function add(event: FormEvent) {
    event.preventDefault();
    if (adding) return;

    setAdding(true);
    setError(null);
    try {
      await createMetric(database, { name, unit });
      setName("");
      setUnit("");
      show("已新增指标");
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setAdding(false);
    }
  }

  async function toggleArchive(metric: MetricRow) {
    const archiving = metric.archived === 0;
    try {
      await archiveMetric(database, metric.id, archiving);
      show(archiving ? "已归档指标" : "已恢复指标");
    } catch {
      show("操作失败，请重试", { tone: "error" });
    }
  }

  return (
    <section aria-labelledby="metrics-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="metrics-heading" className="text-base font-semibold text-neutral-900">
          指标管理
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          正文里写「体重 70kg」就能自动识别。归档后不再识别新记录，旧记录保持不变。
        </p>
      </div>

      <form onSubmit={add} className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-3">
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor={nameId} className="sr-only">
              指标名称
            </label>
            <input
              id={nameId}
              value={name}
              maxLength={10}
              onChange={(event) => setName(event.target.value)}
              placeholder="名称，如 体重"
              className="min-h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-base outline-none focus:border-neutral-400"
            />
          </div>
          <div className="w-24 shrink-0">
            <label htmlFor={unitId} className="sr-only">
              指标单位
            </label>
            <input
              id={unitId}
              value={unit}
              maxLength={6}
              onChange={(event) => setUnit(event.target.value)}
              placeholder="单位"
              className="min-h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-base outline-none focus:border-neutral-400"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={adding || name.trim().length === 0}
          className="min-h-11 self-end rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          {adding ? "新增中…" : "新增指标"}
        </button>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {metrics === undefined ? (
        <p className="py-2 text-sm text-neutral-400">正在加载指标…</p>
      ) : metrics.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-neutral-500">
          还没有指标。先新增一个，再在正文里记录数值。
        </p>
      ) : (
        <ul
          aria-label="指标列表"
          className="divide-y divide-neutral-100 rounded-xl border border-neutral-200"
        >
          {metrics.map((metric) => (
            <li key={metric.id} className="flex items-center gap-1 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-neutral-900">
                  {metric.name}
                  {metric.unit ? <span className="text-neutral-500"> / {metric.unit}</span> : null}
                </p>
                {metric.archived === 1 ? (
                  <span className="text-xs text-neutral-400">已归档</span>
                ) : null}
              </div>
              <button
                type="button"
                aria-label={`编辑指标 ${metric.name}`}
                onClick={() => setEditing(metric)}
                className="min-h-11 rounded-lg px-2 text-sm text-neutral-600 hover:bg-neutral-100"
              >
                编辑
              </button>
              <button
                type="button"
                aria-label={`${metric.archived === 1 ? "恢复" : "归档"}指标 ${metric.name}`}
                onClick={() => void toggleArchive(metric)}
                className="min-h-11 rounded-lg px-2 text-sm text-neutral-600 hover:bg-neutral-100"
              >
                {metric.archived === 1 ? "恢复" : "归档"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <MetricEditDialog
          key={editing.id}
          database={database}
          metric={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </section>
  );
}

interface MetricEditDialogProps {
  database: AppDb;
  metric: MetricRow;
  onClose: () => void;
}

function MetricEditDialog({ database, metric, onClose }: MetricEditDialogProps) {
  const { show } = useToast();
  const [name, setName] = useState(metric.name);
  const [unit, setUnit] = useState(metric.unit);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameId = useId();
  const unitId = useId();

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);
    try {
      await updateMetric(database, metric.id, { name, unit });
      show("已保存指标");
      onClose();
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title={`编辑指标：${metric.name}`} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-3 p-4">
        <label htmlFor={nameId} className="text-sm text-neutral-500">
          名称
        </label>
        <input
          id={nameId}
          value={name}
          maxLength={10}
          onChange={(event) => setName(event.target.value)}
          className="min-h-11 rounded-lg border border-neutral-200 px-3 text-base outline-none focus:border-neutral-400"
        />

        <label htmlFor={unitId} className="text-sm text-neutral-500">
          单位
        </label>
        <input
          id={unitId}
          value={unit}
          maxLength={6}
          onChange={(event) => setUnit(event.target.value)}
          className="min-h-11 rounded-lg border border-neutral-200 px-3 text-base outline-none focus:border-neutral-400"
        />
        <p className="text-xs text-neutral-400">修改单位只影响之后的识别，旧记录保留原来的单位。</p>

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            className="min-h-11 rounded-lg px-3 text-sm text-neutral-600 hover:bg-neutral-100"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={saving || name.trim().length === 0}
            className="min-h-11 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {saving ? "保存中…" : "保存指标"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
