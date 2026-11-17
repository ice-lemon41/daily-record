import { useEffect, useState } from "react";

/**
 * 当前时间：每分钟刷新一次，页面重新可见时立即重算。
 * 用于「今天 / 昨天」分组标题，避免跨零点后标题不更新（技术方案 §4.3）。
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, intervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") tick();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs]);

  return now;
}
