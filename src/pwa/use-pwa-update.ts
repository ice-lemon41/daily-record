import { useCallback, useEffect, useState } from "react";

export interface PwaUpdate {
  needRefresh: boolean;
  update: () => void;
}

/**
 * 手动注册 VitePWA 生成的 sw.js（构建产物里不自动注入注册脚本）。
 * 只有确认新版本已装好、且当前页面已被旧版本控制时才提示；绝不自动刷新。
 */
export function usePwaUpdate(
  enabled: boolean = import.meta.env.PROD,
  reload: () => void = () => window.location.reload(),
): PwaUpdate {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const serviceWorker = navigator.serviceWorker;
    let disposed = false;

    void serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((registration) => {
        if (disposed) return;
        setWaiting(registration.waiting ?? null);
        if (registration.waiting && serviceWorker.controller) setNeedRefresh(true);

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && serviceWorker.controller) {
              setNeedRefresh(true);
            }
          });
        });
      })
      .catch(() => {
        // 不支持或注册失败时保持现状，不影响本地记录功能。
      });

    return () => {
      disposed = true;
    };
  }, [enabled]);

  const update = useCallback(() => {
    waiting?.postMessage({ type: "SKIP_WAITING" });
    setNeedRefresh(false);
    reload();
  }, [waiting, reload]);

  return { needRefresh, update };
}
