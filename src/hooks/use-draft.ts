import { useCallback, useEffect, useRef, useState } from "react";
import type { AppDb } from "../db/db";
import { deleteKv, getKv, setKv } from "../db/repositories/kv";
import { DRAFT_DEBOUNCE_MS, DRAFT_KV_KEY } from "../domain/constants";

/** 草稿里的时间归属：null 表示跟随「现在」（PRD FR-02-1）。 */
export interface DraftRecord {
  content: string;
  occurredAt: number | null;
}

export interface DraftState {
  content: string;
  occurredAt: number | null;
  setContent: (value: string) => void;
  setOccurredAt: (value: number | null) => void;
  /** 清空正文并把时间归属恢复到「现在」，同时删除草稿。 */
  clear: () => void;
  hydrated: boolean;
}

/**
 * 全局唯一草稿（PRD FR-02）：
 * - 内容或时间归属变化后防抖 300ms 写 kv；
 * - 打开页面时恢复，并回调一次 onRestored；
 * - 提交成功 / 主动清空后删除。
 */
export function useDraft(
  db: AppDb,
  options: { onRestored?: () => void; debounceMs?: number } = {},
): DraftState {
  const { debounceMs = DRAFT_DEBOUNCE_MS } = options;
  const [content, setContentState] = useState("");
  const [occurredAt, setOccurredAt] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const onRestoredRef = useRef(options.onRestored);
  onRestoredRef.current = options.onRestored;

  useEffect(() => {
    let cancelled = false;

    getKv<DraftRecord>(db, DRAFT_KV_KEY)
      .then((draft) => {
        if (cancelled) return;
        if (draft) {
          setContentState(draft.content ?? "");
          setOccurredAt(typeof draft.occurredAt === "number" ? draft.occurredAt : null);
          onRestoredRef.current?.();
        }
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [db]);

  useEffect(() => {
    if (!hydrated) return;

    const timer = window.setTimeout(() => {
      if (content.trim().length === 0 && occurredAt === null) {
        void deleteKv(db, DRAFT_KV_KEY);
        return;
      }
      void setKv(db, DRAFT_KV_KEY, { content, occurredAt } satisfies DraftRecord);
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [db, hydrated, content, occurredAt, debounceMs]);

  const setContent = useCallback((value: string) => setContentState(value), []);

  const clear = useCallback(() => {
    setContentState("");
    setOccurredAt(null);
    void deleteKv(db, DRAFT_KV_KEY);
  }, [db]);

  return { content, occurredAt, setContent, setOccurredAt, clear, hydrated };
}
