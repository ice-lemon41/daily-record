import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import type { AppDb } from "../../db/db";
import {
  deleteEntry,
  listEntriesByTag,
  listEntriesForDay,
  listMetricValuesForEntries,
  listPinnedEntries,
  listTimeline,
  restoreEntry,
  searchEntries,
} from "../../db/repositories/entries";
import type { EntryRow } from "../../db/schema";
import { PAGE_SIZE } from "../../domain/constants";
import { EntryEditor } from "../editor/EntryEditor";
import type { EntryFilter } from "../filter";
import { groupEntriesByDay } from "./grouping";
import { TimelineEntry, type TagSelection } from "./TimelineEntry";

interface TimelineProps {
  database: AppDb;
  now: number;
  filter?: EntryFilter | null;
  onTagClick?: (tag: TagSelection) => void;
}

/** 时间线：置顶区 + 日期分组 + 滚动分页（PRD FR-05 / FR-07）。 */
export function Timeline({ database, now, filter = null, onTagClick }: TimelineProps) {
  const { show } = useToast();
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [editing, setEditing] = useState<EntryRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<EntryRow | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPageSize(PAGE_SIZE);
  }, [filter]);

  const pinned = useLiveQuery(
    () => (filter ? Promise.resolve<EntryRow[]>([]) : listPinnedEntries(database)),
    [database, filter],
  );
  const data = useLiveQuery(async () => {
    if (filter?.kind === "day") {
      const items = await listEntriesForDay(database, filter.dayStart);
      return { items: items.slice(0, pageSize), hasMore: items.length > pageSize };
    }
    if (filter?.kind === "tag") {
      const page = await listEntriesByTag(database, filter.nameLower, { limit: pageSize });
      return { items: page.items, hasMore: page.nextCursor !== null };
    }
    if (filter?.kind === "search") {
      const items = await searchEntries(database, filter.keyword);
      return { items: items.slice(0, pageSize), hasMore: items.length > pageSize };
    }
    const page = await listTimeline(database, { pinned: false, limit: pageSize });
    return { items: page.items, hasMore: page.nextCursor !== null };
  }, [database, filter, pageSize]);

  const ids = [...(pinned ?? []), ...(data?.items ?? [])].map((entry) => entry.id);
  const idKey = ids.join("|");
  const metricValues = useLiveQuery(
    () => listMetricValuesForEntries(database, idKey ? idKey.split("|") : []),
    [database, idKey],
  );

  const hasMore = data?.hasMore === true;
  const loaded = pinned !== undefined && data !== undefined;
  const pinnedItems = filter ? [] : (pinned ?? []);
  const items = data?.items ?? [];
  const groups = groupEntriesByDay(items, now);
  const keyword = filter?.kind === "search" ? filter.keyword : undefined;

  useEffect(() => {
    if (!hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setPageSize((size) => size + PAGE_SIZE);
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMore]);

  async function confirmDelete() {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(null);

    try {
      await deleteEntry(database, target.id);
      show("已删除", {
        durationMs: 5000,
        action: {
          label: "撤销",
          onClick: async () => {
            try {
              await restoreEntry(database, target.id);
              show("已恢复");
            } catch {
              show("恢复失败，请重试", { tone: "error" });
            }
          },
        },
      });
    } catch {
      show("删除失败，请重试", { tone: "error" });
    }
  }

  function requestDelete(entry: EntryRow) {
    setEditing(null);
    setPendingDelete(entry);
  }

  if (!loaded) {
    return <p className="py-8 text-center text-sm text-neutral-400">正在加载…</p>;
  }

  if (pinnedItems.length === 0 && items.length === 0) {
    if (filter) {
      const message =
        filter.kind === "search"
          ? "没有找到相关记录"
          : filter.kind === "day"
            ? "这天还没有记录。"
            : `没有带 #${filter.name} 的记录。`;
      return (
        <div className="mt-6 rounded-2xl border border-dashed border-neutral-200 px-6 py-10 text-center">
          <p className="text-sm text-neutral-500">{message}</p>
          {filter.kind === "day" ? (
            <p className="mt-2 text-xs text-neutral-400">可以用上方「在这天补记」。</p>
          ) : null}
        </div>
      );
    }

    return (
      <div className="mt-6 rounded-2xl border border-dashed border-neutral-200 px-6 py-10 text-center">
        <p className="text-sm text-neutral-500">还没有记录，写下第一条吧。</p>
        <p className="mt-2 text-xs text-neutral-400">支持 #标签、体重 70kg 这样的写法</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-10">
      {pinnedItems.length > 0 ? (
        <section aria-labelledby="pinned-heading">
          <h2
            id="pinned-heading"
            className="sticky top-0 z-10 bg-white/95 py-1 text-xs font-semibold text-neutral-500 backdrop-blur"
          >
            置顶
          </h2>
          <div>
            {pinnedItems.map((entry) => (
              <TimelineEntry
                key={entry.id}
                database={database}
                entry={entry}
                metrics={metricValues?.get(entry.id) ?? []}
                keyword={keyword}
                onEdit={setEditing}
                onRequestDelete={requestDelete}
                onTagClick={onTagClick}
              />
            ))}
          </div>
        </section>
      ) : null}

      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`group-${group.key}`}>
          <h2
            id={`group-${group.key}`}
            className="sticky top-0 z-10 bg-white/95 py-1 text-xs font-semibold text-neutral-500 backdrop-blur"
          >
            {group.title}
          </h2>
          <div>
            {group.items.map((entry) => (
              <TimelineEntry
                key={entry.id}
                database={database}
                entry={entry}
                metrics={metricValues?.get(entry.id) ?? []}
                keyword={keyword}
                onEdit={setEditing}
                onRequestDelete={requestDelete}
                onTagClick={onTagClick}
              />
            ))}
          </div>
        </section>
      ))}

      <div ref={sentinelRef} aria-hidden="true" />

      {hasMore ? (
        <button
          type="button"
          onClick={() => setPageSize((size) => size + PAGE_SIZE)}
          className="mx-auto min-h-11 rounded-lg px-4 text-sm text-neutral-500 hover:bg-neutral-100"
        >
          加载更早
        </button>
      ) : null}

      <EntryEditor
        database={database}
        entry={editing}
        onClose={() => setEditing(null)}
        onRequestDelete={requestDelete}
      />

      <Modal open={pendingDelete !== null} title="删除记录" onClose={() => setPendingDelete(null)}>
        <div className="p-4">
          <p className="text-sm text-neutral-600">删除后 5 秒内可以撤销。</p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="min-h-11 rounded-lg px-3 text-sm text-neutral-600 hover:bg-neutral-100"
              onClick={() => setPendingDelete(null)}
            >
              取消
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700"
              onClick={() => void confirmDelete()}
            >
              删除
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
