import { useLiveQuery } from "dexie-react-hooks";
import { type ChangeEvent, useRef, useState } from "react";
import packageJson from "../../../package.json";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import type { AppDb } from "../../db/db";
import { loadExportSource, loadMarkdownSource, replaceAllData } from "../../db/repositories/backup";
import { getKv, setKv } from "../../db/repositories/kv";
import { describeBackup } from "../../domain/backup";
import { LAST_EXPORT_AT_KV_KEY, MAX_IMPORT_BYTES } from "../../domain/constants";
import { dateKey } from "../../domain/dates";
import { exportFileName, toExportBundle } from "../../domain/export-json";
import { toMarkdown } from "../../domain/export-markdown";
import { type ImportResult, parseImportJson } from "../../domain/import-json";
import { downloadText } from "./download";
import { MetricManager } from "./MetricManager";

type ImportSuccess = Extract<ImportResult, { ok: true }>;

interface SettingsPageProps {
  database: AppDb;
  now: number;
  onClose: () => void;
}

function jsonText(source: Awaited<ReturnType<typeof loadExportSource>>): string {
  return `${JSON.stringify(toExportBundle(source), null, 2)}\n`;
}

/** 设置页：备份、导入导出、指标管理、版本号（PRD §6.4 / FR-09 / FR-10 / FR-12）。 */
export function SettingsPage({ database, now, onClose }: SettingsPageProps) {
  const { show } = useToast();
  const [busy, setBusy] = useState<"json" | "md" | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ fileName: string; result: ImportSuccess } | null>(null);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const lastExportAt = useLiveQuery(
    () => getKv<number>(database, LAST_EXPORT_AT_KV_KEY),
    [database],
  );
  const backup = describeBackup(lastExportAt ?? null, now);

  async function exportJson() {
    if (busy) return;
    setBusy("json");
    try {
      const exportedAt = Date.now();
      const source = await loadExportSource(database, exportedAt);
      downloadText({
        fileName: exportFileName("json", exportedAt),
        text: jsonText(source),
        mimeType: "application/json",
      });
      await setKv(database, LAST_EXPORT_AT_KV_KEY, exportedAt);
      show("JSON 备份已导出");
    } catch {
      show("导出失败，请重试", { tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function exportMarkdown() {
    if (busy) return;
    setBusy("md");
    try {
      const exportedAt = Date.now();
      const source = await loadMarkdownSource(database, exportedAt);
      downloadText({
        fileName: exportFileName("md", exportedAt),
        text: toMarkdown(source),
        mimeType: "text/markdown",
      });
      // Markdown 只能阅读、不能导入，因此不算备份（PRD FR-10-4）。
      show("Markdown 已导出");
    } catch {
      show("导出失败，请重试", { tone: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setImportError(null);
    setConfirmError(null);

    if (file.size > MAX_IMPORT_BYTES) {
      setImportError("文件超过 50 MB，无法导入");
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      setImportError("读取文件失败，请重试");
      return;
    }

    const result = parseImportJson(text);
    if (!result.ok) {
      setImportError(result.message);
      return;
    }

    setPending({ fileName: file.name, result });
  }

  async function confirmImport() {
    const target = pending;
    if (!target || importing) return;

    setImporting(true);
    setConfirmError(null);
    try {
      // 覆盖前自动下载当前数据作为保险（PRD FR-10-3）。
      const exportedAt = Date.now();
      const current = await loadExportSource(database, exportedAt);
      downloadText({
        fileName: exportFileName("json", exportedAt),
        text: jsonText(current),
        mimeType: "application/json",
      });

      const summary = await replaceAllData(database, target.result.bundle);
      setPending(null);
      show(`导入完成：${summary.entries} 条记录、${summary.metrics} 个指标`);
    } catch {
      setConfirmError("导入失败，原有数据保持不变");
    } finally {
      setImporting(false);
    }
  }

  const stats = pending?.result.stats;
  const range =
    stats && stats.from !== null && stats.to !== null
      ? `${dateKey(stats.from)} 至 ${dateKey(stats.to)}`
      : "没有条目";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-1">
        <button
          type="button"
          aria-label="返回主界面"
          onClick={onClose}
          className="min-h-11 rounded-lg px-2 text-sm text-neutral-600 hover:bg-neutral-100"
        >
          ‹ 返回
        </button>
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">设置</h1>
      </header>

      <main className="flex flex-col gap-6 px-4 pb-10 pt-2">
        <section aria-labelledby="backup-heading" className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 id="backup-heading" className="text-base font-semibold text-neutral-900">
              备份
            </h2>
            {backup.needsBackup ? (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                需要备份
              </span>
            ) : null}
          </div>
          <p className="text-sm text-neutral-600">{backup.label}</p>
          <p className="text-xs text-neutral-400">
            建议每 14 天导出一次 JSON。只有 JSON 能恢复，Markdown 仅供阅读。
          </p>

          <div className="mt-1 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void exportJson()}
              disabled={busy !== null}
              className="min-h-11 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {busy === "json" ? "导出中…" : "导出 JSON"}
            </button>
            <button
              type="button"
              onClick={() => void exportMarkdown()}
              disabled={busy !== null}
              className="min-h-11 rounded-lg border border-neutral-200 px-4 text-sm text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400"
            >
              {busy === "md" ? "导出中…" : "导出 Markdown"}
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="min-h-11 rounded-lg border border-neutral-200 px-4 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              导入 JSON
            </button>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            aria-label="选择备份文件"
            className="sr-only"
            onChange={(event) => void pickFile(event)}
          />

          {importError ? (
            <p role="alert" className="text-sm text-red-600">
              {importError}
            </p>
          ) : null}
        </section>

        <MetricManager database={database} />

        <section aria-labelledby="about-heading" className="flex flex-col gap-1">
          <h2 id="about-heading" className="text-base font-semibold text-neutral-900">
            关于
          </h2>
          <p className="text-sm text-neutral-600">版本 {packageJson.version}</p>
          <p className="text-xs text-neutral-400">数据只保存在这台设备上，不会上传。</p>
        </section>
      </main>

      <Modal
        open={pending !== null}
        title="导入预览"
        onClose={() => {
          if (!importing) setPending(null);
        }}
      >
        {pending && stats ? (
          <div className="overflow-y-auto p-4">
            <p className="break-all text-xs text-neutral-400">{pending.fileName}</p>

            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-neutral-500">条目</dt>
              <dd className="text-neutral-900">{stats.entries} 条</dd>
              <dt className="text-neutral-500">指标</dt>
              <dd className="text-neutral-900">{stats.metrics} 个</dd>
              <dt className="text-neutral-500">时间范围</dt>
              <dd className="text-neutral-900">{range}</dd>
            </dl>

            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">
              导入会覆盖当前全部数据。开始前会自动下载一份当前 JSON 作为保险。
            </p>

            {confirmError ? (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {confirmError}
              </p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={importing}
                className="min-h-11 rounded-lg px-3 text-sm text-neutral-600 hover:bg-neutral-100 disabled:text-neutral-400"
                onClick={() => setPending(null)}
              >
                取消
              </button>
              <button
                type="button"
                disabled={importing}
                className="min-h-11 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
                onClick={() => void confirmImport()}
              >
                {importing ? "导入中…" : "导入并覆盖"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
