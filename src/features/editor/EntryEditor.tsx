import { useEffect, useId, useState } from "react";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import type { AppDb } from "../../db/db";
import { EmptyContentError, updateEntry } from "../../db/repositories/entries";
import type { EntryRow } from "../../db/schema";
import { combineLocalDateTime, splitLocalDateTime } from "../../domain/dates";

interface EntryEditorProps {
  database: AppDb;
  entry: EntryRow | null;
  onClose: () => void;
  onRequestDelete: (entry: EntryRow) => void;
}

/** 编辑面板：正文、发生时间、置顶、删除、保存（PRD §6.3 / FR-08）。 */
export function EntryEditor({ database, entry, onClose, onRequestDelete }: EntryEditorProps) {
  const { show } = useToast();
  const [content, setContent] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const contentId = useId();
  const dateId = useId();
  const timeId = useId();

  useEffect(() => {
    if (!entry) return;
    const parts = splitLocalDateTime(entry.occurredAt);
    setContent(entry.content);
    setDate(parts.date);
    setTime(parts.time);
    setPinned(entry.pinned === 1);
    setError(null);
  }, [entry]);

  if (!entry) return null;

  const isEmpty = content.trim().length === 0;

  async function save() {
    if (saving || !entry) return;
    if (isEmpty) {
      setError("正文不能为空，如需清空请删除");
      return;
    }
    const occurredAt = combineLocalDateTime(date, time);
    if (occurredAt === null) {
      setError("日期或时间无效，请重新选择");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateEntry(database, entry.id, {
        content,
        occurredAt,
        pinned: pinned ? 1 : 0,
      });
      show("已保存");
      onClose();
    } catch (reason) {
      setError(
        reason instanceof EmptyContentError ? "正文不能为空，如需清空请删除" : "保存失败，请重试",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title="编辑记录" onClose={onClose}>
      <form
        className="flex flex-col gap-3 overflow-y-auto p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label htmlFor={contentId} className="sr-only">
          正文
        </label>
        <textarea
          id={contentId}
          value={content}
          rows={5}
          onChange={(event) => setContent(event.target.value)}
          className="max-h-56 min-h-28 w-full resize-none rounded-xl border border-neutral-200 p-3 text-base leading-6 outline-none focus:border-neutral-400"
        />

        <div className="flex flex-col gap-2">
          <label className="flex items-center justify-between gap-3 text-sm" htmlFor={dateId}>
            <span className="text-neutral-500">日期</span>
            <input
              id={dateId}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="min-h-11 rounded-lg border border-neutral-200 px-3 py-2 text-base"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm" htmlFor={timeId}>
            <span className="text-neutral-500">时间</span>
            <input
              id={timeId}
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className="min-h-11 rounded-lg border border-neutral-200 px-3 py-2 text-base"
            />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
            <span className="text-neutral-500">置顶</span>
            <input
              type="checkbox"
              checked={pinned}
              onChange={(event) => setPinned(event.target.checked)}
              className="h-5 w-5 accent-neutral-900"
            />
          </label>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex items-center justify-between gap-2">
          <button
            type="button"
            className="min-h-11 rounded-lg px-3 text-sm text-red-600 hover:bg-red-50"
            onClick={() => onRequestDelete(entry)}
          >
            删除
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="min-h-11 rounded-lg px-3 text-sm text-neutral-600 hover:bg-neutral-100"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving || isEmpty}
              className="min-h-11 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
