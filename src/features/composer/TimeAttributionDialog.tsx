import { useEffect, useId, useRef, useState } from "react";
import { Modal } from "../../components/Modal";
import { combineLocalDateTime, splitLocalDateTime } from "../../domain/dates";

interface TimeAttributionDialogProps {
  open: boolean;
  /** null 表示跟随「现在」。 */
  value: number | null;
  now: number;
  onClose: () => void;
  onConfirm: (occurredAt: number | null) => void;
}

/** 提交前修改时间归属（PRD FR-01-5/6）。 */
export function TimeAttributionDialog({
  open,
  value,
  now,
  onClose,
  onConfirm,
}: TimeAttributionDialogProps) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const dateId = useId();
  const timeId = useId();
  const latest = useRef({ value, now });
  latest.current = { value, now };

  useEffect(() => {
    if (!open) return;
    const parts = splitLocalDateTime(latest.current.value ?? latest.current.now);
    setDate(parts.date);
    setTime(parts.time);
    setError(null);
  }, [open]);

  return (
    <Modal open={open} title="记录时间" onClose={onClose}>
      <form
        className="flex flex-col gap-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const ts = combineLocalDateTime(date, time);
          if (ts === null) {
            setError("日期或时间无效，请重新选择");
            return;
          }
          onConfirm(ts);
        }}
      >
        <div className="flex flex-col gap-3">
          <label className="flex items-center justify-between gap-3 text-sm" htmlFor={dateId}>
            <span className="text-neutral-500">日期</span>
            <input
              id={dateId}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="min-h-11 rounded-lg border border-neutral-200 px-3 py-2 text-base"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm" htmlFor={timeId}>
            <span className="text-neutral-500">时间</span>
            <input
              id={timeId}
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className="min-h-11 rounded-lg border border-neutral-200 px-3 py-2 text-base"
            />
          </label>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="min-h-11 rounded-lg px-3 text-sm text-emerald-700 hover:bg-emerald-50"
            onClick={() => onConfirm(null)}
          >
            使用现在
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              className="min-h-11 rounded-lg px-3 text-sm text-neutral-600 hover:bg-neutral-100"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="submit"
              className="min-h-11 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800"
            >
              确定
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
