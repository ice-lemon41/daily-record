import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../components/Toast";
import type { AppDb } from "../../db/db";
import { createEntry } from "../../db/repositories/entries";
import { listMetrics } from "../../db/repositories/metrics";
import { formatClock, formatGroupTitle } from "../../domain/dates";
import { type MetricDefinition, parseMetrics } from "../../domain/parse-metrics";
import { parseTags } from "../../domain/parse-tags";
import { useDraft } from "../../hooks/use-draft";
import { TimeAttributionDialog } from "./TimeAttributionDialog";

/** 补记请求：id 用于区分同一时间点的多次点击（PRD FR-06-3）。 */
export interface BackfillRequest {
  id: number;
  occurredAt: number;
}

/** 顶部常驻输入框：草稿、时间归属、解析预览与提交（FR-01 / FR-02）。 */
export function Composer({
  database,
  now,
  backfillRequest = null,
}: {
  database: AppDb;
  now: number;
  backfillRequest?: BackfillRequest | null;
}) {
  const { show } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const handledBackfill = useRef<number | null>(null);
  const draft = useDraft(database, {
    onRestored: () => show("已恢复未提交的内容"),
  });

  useEffect(() => {
    if (!draft.hydrated || backfillRequest === null) return;
    if (handledBackfill.current === backfillRequest.id) return;
    handledBackfill.current = backfillRequest.id;
    draft.setOccurredAt(backfillRequest.occurredAt);
    textareaRef.current?.focus();
  }, [draft.hydrated, draft.setOccurredAt, backfillRequest]);

  const metrics = useLiveQuery(() => listMetrics(database), [database]);
  const definitions = useMemo<MetricDefinition[]>(
    () =>
      (metrics ?? []).map((metric) => ({ id: metric.id, name: metric.name, unit: metric.unit })),
    [metrics],
  );

  const tags = useMemo(() => {
    const seen = new Set<string>();
    return parseTags(draft.content).filter((tag) => {
      const key = tag.nameLower;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [draft.content]);
  const parsedMetrics = useMemo(
    () => parseMetrics(draft.content, definitions),
    [draft.content, definitions],
  );

  const isEmpty = draft.content.trim().length === 0;

  async function submit() {
    if (submitting) return;
    if (isEmpty) {
      textareaRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await createEntry(database, {
        content: draft.content,
        occurredAt: draft.occurredAt ?? Date.now(),
      });
      draft.clear();
      show("已记录");
    } catch {
      setError("保存失败，请重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-label="快速记录" className="px-4 pb-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm focus-within:border-neutral-400"
      >
        <label htmlFor="composer-content" className="sr-only">
          记录内容
        </label>
        <textarea
          id="composer-content"
          ref={textareaRef}
          value={draft.content}
          onChange={(event) => draft.setContent(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          rows={3}
          placeholder="记点什么… 支持 #标签 和 体重 70kg"
          className="max-h-40 min-h-16 w-full resize-none bg-transparent text-base leading-6 text-neutral-900 outline-none placeholder:text-neutral-400"
        />

        {tags.length > 0 || parsedMetrics.length > 0 ? (
          <ul aria-label="解析预览" className="mt-1 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <li
                key={`tag-${tag.nameLower}`}
                className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
              >
                #{tag.name}
              </li>
            ))}
            {parsedMetrics.map((metric) => (
              <li
                key={`metric-${metric.metricId}`}
                className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700"
              >
                {metric.name} {metric.value}
                {metric.unit ? ` ${metric.unit}` : ""}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setTimeOpen(true)}
            className="min-h-11 rounded-lg px-2 text-left text-xs text-neutral-500 hover:bg-neutral-100"
          >
            {draft.occurredAt === null
              ? `现在 ${formatClock(now)}`
              : `${formatGroupTitle(draft.occurredAt, now)} ${formatClock(draft.occurredAt)}`}
          </button>
          <button
            type="submit"
            disabled={submitting || isEmpty}
            className="min-h-11 shrink-0 rounded-xl bg-neutral-900 px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {submitting ? "保存中…" : "记录"}
          </button>
        </div>

        {error ? (
          <p role="alert" className="mt-1 text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </form>

      <TimeAttributionDialog
        open={timeOpen}
        value={draft.occurredAt}
        now={now}
        onClose={() => setTimeOpen(false)}
        onConfirm={(occurredAt) => {
          draft.setOccurredAt(occurredAt);
          setTimeOpen(false);
        }}
      />
    </section>
  );
}
