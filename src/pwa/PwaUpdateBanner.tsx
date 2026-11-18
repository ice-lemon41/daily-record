interface PwaUpdateBannerProps {
  needRefresh: boolean;
  hasUnsaved: boolean;
  onRefresh: () => void;
  onDismiss: () => void;
}

/** 新版本提示条：不自动 reload；有草稿时只提示保存，不再尝试刷新（PRD FR-11-3）。 */
export function PwaUpdateBanner({
  needRefresh,
  hasUnsaved,
  onRefresh,
  onDismiss,
}: PwaUpdateBannerProps) {
  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 bg-neutral-900 px-4 py-2 text-sm text-white"
    >
      <span className="flex-1">{hasUnsaved ? "有新版本，保存后再刷新" : "有新版本，点击刷新"}</span>
      {hasUnsaved ? (
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-9 rounded-lg px-3 text-xs text-neutral-200 hover:bg-white/10"
        >
          稍后
        </button>
      ) : (
        <button
          type="button"
          onClick={onRefresh}
          className="min-h-9 rounded-lg bg-white px-3 text-xs font-medium text-neutral-900 hover:bg-neutral-100"
        >
          刷新
        </button>
      )}
    </div>
  );
}
