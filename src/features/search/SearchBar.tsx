import { useEffect, useRef, useState } from "react";

interface SearchBarProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSearch: (keyword: string) => void;
  /** 防抖时长（PRD FR-07-1：200ms）。 */
  debounceMs?: number;
}

/** 顶栏搜索：展开后输入即搜，空关键词交给上层清除筛选。 */
export function SearchBar({ open, onOpen, onClose, onSearch, debounceMs = 200 }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      return;
    }
    setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => onSearchRef.current(query), debounceMs);
    return () => window.clearTimeout(timer);
  }, [open, query, debounceMs]);

  if (!open) {
    return (
      <button
        type="button"
        aria-label="搜索"
        onClick={onOpen}
        className="min-h-11 rounded-lg px-3 text-sm text-neutral-600 hover:bg-neutral-100"
      >
        搜索
      </button>
    );
  }

  return (
    <div className="flex flex-1 items-center gap-1">
      <input
        ref={inputRef}
        type="search"
        aria-label="搜索记录"
        placeholder="搜索正文或标签"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
        className="min-h-11 min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 text-base outline-none focus:border-neutral-400"
      />
      <button
        type="button"
        aria-label="关闭搜索"
        onClick={onClose}
        className="min-h-11 shrink-0 rounded-lg px-3 text-sm text-neutral-500 hover:bg-neutral-100"
      >
        取消
      </button>
    </div>
  );
}
