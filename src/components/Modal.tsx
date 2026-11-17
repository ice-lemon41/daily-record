import { type ReactNode, useEffect, useId, useRef } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * 原生 <dialog>：浏览器里用 showModal 获得焦点管理与背景遮罩；
 * jsdom 未实现 showModal 时退回 open 属性，保证单测可交互。
 */
export function Modal({ open, title, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
      }
    } else if (dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="m-auto w-[calc(100%-2rem)] max-w-[398px] rounded-2xl bg-white p-0 text-neutral-900 shadow-2xl backdrop:bg-black/40 open:block"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {open ? (
        <div className="flex max-h-[85dvh] flex-col">
          <h2
            id={titleId}
            className="border-b border-neutral-100 px-4 py-3 text-base font-semibold"
          >
            {title}
          </h2>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
