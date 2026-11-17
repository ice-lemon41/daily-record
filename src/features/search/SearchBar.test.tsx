import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchBar } from "./SearchBar";

function setup(open = true) {
  const onOpen = vi.fn();
  const onClose = vi.fn();
  const onSearch = vi.fn();
  const view = render(
    <SearchBar open={open} onOpen={onOpen} onClose={onClose} onSearch={onSearch} />,
  );
  return { ...view, onOpen, onClose, onSearch };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("SearchBar", () => {
  it("关闭时显示搜索按钮，点击后展开并聚焦输入框", () => {
    vi.useFakeTimers();
    const { onOpen, rerender } = setup(false);

    expect(screen.queryByLabelText("搜索记录")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    expect(onOpen).toHaveBeenCalledTimes(1);

    rerender(<SearchBar open onOpen={onOpen} onClose={vi.fn()} onSearch={vi.fn()} />);
    expect(screen.getByLabelText("搜索记录")).toHaveFocus();
  });

  it("输入后防抖 200ms 再触发搜索", () => {
    vi.useFakeTimers();
    const { onSearch } = setup();

    fireEvent.change(screen.getByLabelText("搜索记录"), { target: { value: "开会" } });

    act(() => vi.advanceTimersByTime(199));
    expect(onSearch).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onSearch).toHaveBeenCalledWith("开会");
  });

  it("连续输入只触发最后一次", () => {
    vi.useFakeTimers();
    const { onSearch } = setup();

    fireEvent.change(screen.getByLabelText("搜索记录"), { target: { value: "开" } });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.change(screen.getByLabelText("搜索记录"), { target: { value: "开会" } });
    act(() => vi.advanceTimersByTime(200));

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("开会");
  });

  it("清空输入会按空关键词通知上层", () => {
    vi.useFakeTimers();
    const { onSearch } = setup();

    fireEvent.change(screen.getByLabelText("搜索记录"), { target: { value: "开会" } });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.change(screen.getByLabelText("搜索记录"), { target: { value: "" } });
    act(() => vi.advanceTimersByTime(200));

    expect(onSearch).toHaveBeenLastCalledWith("");
  });

  it("点取消或按 Escape 都关闭搜索", () => {
    vi.useFakeTimers();
    const { onClose } = setup();

    fireEvent.click(screen.getByRole("button", { name: "关闭搜索" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByLabelText("搜索记录"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
