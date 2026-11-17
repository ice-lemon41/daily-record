import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./Toast";

function Trigger() {
  const { show } = useToast();
  return (
    <div>
      <button type="button" onClick={() => show("已保存")}>
        普通提示
      </button>
      <button
        type="button"
        onClick={() =>
          show("已删除", {
            durationMs: 5000,
            action: { label: "撤销", onClick: () => show("已恢复") },
          })
        }
      >
        删除提示
      </button>
    </div>
  );
}

function renderToast() {
  render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ToastProvider", () => {
  it("显示提示并在 3 秒后自动消失", () => {
    vi.useFakeTimers();
    renderToast();

    fireEvent.click(screen.getByRole("button", { name: "普通提示" }));
    expect(screen.getByRole("status")).toHaveTextContent("已保存");

    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("撤销按钮触发回调并关闭提示", () => {
    vi.useFakeTimers();
    renderToast();

    fireEvent.click(screen.getByRole("button", { name: "删除提示" }));
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));

    expect(screen.getByRole("status")).toHaveTextContent("已恢复");
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
