import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../components/Toast";
import type { AppDb } from "../../db/db";
import { updateEntry } from "../../db/repositories/entries";
import type { EntryMetricRow, EntryRow } from "../../db/schema";
import { formatClock } from "../../domain/dates";
import { splitHighlight } from "../../domain/highlight";
import { parseTags } from "../../domain/parse-tags";

export interface TagSelection {
  name: string;
  nameLower: string;
}

/** 正文中命中搜索词的部分用背景色高亮，不改变文字颜色（PRD FR-07-2）。 */
function Highlighted({ text, keyword }: { text: string; keyword?: string }) {
  return (
    <>
      {splitHighlight(text, keyword ?? "").map((part, index) =>
        part.match ? (
          <mark key={index} className="rounded-sm bg-amber-200/70 text-inherit">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

/** 超过 6 行折叠（PRD FR-05-4）；按行数与字数近似判断。 */
export function isLongContent(content: string): boolean {
  return content.split("\n").length > 6 || content.length > 120;
}

interface TimelineEntryProps {
  database: AppDb;
  entry: EntryRow;
  metrics: EntryMetricRow[];
  keyword?: string;
  onEdit: (entry: EntryRow) => void;
  onRequestDelete: (entry: EntryRow) => void;
  onTagClick?: (tag: TagSelection) => void;
}

export function TimelineEntry({
  database,
  entry,
  metrics,
  keyword,
  onEdit,
  onRequestDelete,
  onTagClick,
}: TimelineEntryProps) {
  const { show } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const long = isLongContent(entry.content);
  const tags = useMemo(() => {
    const seen = new Set<string>();
    return parseTags(entry.content).filter((tag) => {
      if (seen.has(tag.nameLower)) return false;
      seen.add(tag.nameLower);
      return true;
    });
  }, [entry.content]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  async function togglePin() {
    setMenuOpen(false);
    try {
      await updateEntry(database, entry.id, { pinned: entry.pinned === 1 ? 0 : 1 });
      show(entry.pinned === 1 ? "已取消置顶" : "已置顶");
    } catch {
      show("操作失败，请重试", { tone: "error" });
    }
  }

  return (
    <article className="flex gap-3 border-b border-neutral-100 py-3 last:border-0">
      <time
        dateTime={new Date(entry.occurredAt).toISOString()}
        className="w-11 shrink-0 pt-1 text-xs tabular-nums text-neutral-400"
      >
        {formatClock(entry.occurredAt)}
      </time>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onEdit(entry)}
          aria-label={`编辑 ${formatClock(entry.occurredAt)} 的记录`}
          className="block w-full text-left"
        >
          <span
            className={`whitespace-pre-wrap break-words text-[15px] leading-6 text-neutral-800 ${
              expanded || !long ? "" : "line-clamp-6"
            }`}
          >
            <Highlighted text={entry.content} keyword={keyword} />
          </span>
        </button>

        {long ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mt-1 text-xs text-neutral-500 underline-offset-2 hover:underline"
          >
            {expanded ? "收起" : "展开"}
          </button>
        ) : null}

        {tags.length > 0 ? (
          <ul aria-label="标签" className="mt-1 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <li key={tag.nameLower}>
                <button
                  type="button"
                  aria-label={`筛选标签 ${tag.name}`}
                  onClick={() => onTagClick?.(tag)}
                  className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 hover:bg-emerald-100"
                >
                  #<Highlighted text={tag.name} keyword={keyword} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {metrics.length > 0 ? (
          <ul aria-label="指标摘要" className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {metrics.map((metric) => (
              <li key={metric.id} className="text-xs text-neutral-400">
                {metric.nameSnapshot} {metric.value}
                {metric.unit ? ` ${metric.unit}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          aria-label="更多操作"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
          className="flex h-11 w-8 items-start justify-center rounded-lg pt-1 text-neutral-400 hover:bg-neutral-100"
        >
          …
        </button>

        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 top-10 z-20 w-32 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              className="block min-h-11 w-full px-3 text-left text-sm hover:bg-neutral-50"
              onClick={() => {
                setMenuOpen(false);
                onEdit(entry);
              }}
            >
              编辑
            </button>
            <button
              type="button"
              role="menuitem"
              className="block min-h-11 w-full px-3 text-left text-sm hover:bg-neutral-50"
              onClick={() => void togglePin()}
            >
              {entry.pinned === 1 ? "取消置顶" : "置顶"}
            </button>
            <button
              type="button"
              role="menuitem"
              className="block min-h-11 w-full px-3 text-left text-sm text-red-600 hover:bg-red-50"
              onClick={() => {
                setMenuOpen(false);
                onRequestDelete(entry);
              }}
            >
              删除
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
