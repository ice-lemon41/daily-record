import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface ToastOptions {
  /** 毫秒，默认 3000；删除撤销用 5000。 */
  durationMs?: number;
  action?: {
    label: string;
    onClick: () => void | Promise<void>;
  };
  tone?: "default" | "error";
}

interface ToastState extends ToastOptions {
  id: number;
  message: string;
}

interface ToastContextValue {
  show: (message: string, options?: ToastOptions) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const show = useCallback(
    (message: string, options: ToastOptions = {}) => {
      clearTimer();
      const id = Date.now();
      setToast({ id, message, ...options });
      timerRef.current = window.setTimeout(
        () => setToast((current) => (current?.id === id ? null : current)),
        options.durationMs ?? 3000,
      );
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-[398px] -translate-x-1/2 items-center gap-3 rounded-xl bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg"
        >
          <span className={toast.tone === "error" ? "flex-1 text-red-200" : "flex-1"}>
            {toast.message}
          </span>
          {toast.action ? (
            <button
              type="button"
              className="min-h-11 shrink-0 rounded-lg px-2 font-medium text-emerald-300 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
              onClick={() => {
                const action = toast.action;
                dismiss();
                void action?.onClick();
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast 必须在 ToastProvider 内使用");
  return context;
}
