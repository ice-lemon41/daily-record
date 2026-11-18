import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PwaUpdateBanner } from "./PwaUpdateBanner";

afterEach(cleanup);

describe("PwaUpdateBanner", () => {
  it("没有新版本时不显示", () => {
    render(
      <PwaUpdateBanner
        needRefresh={false}
        hasUnsaved={false}
        onRefresh={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("可刷新时显示提示文案，点击才刷新", () => {
    const onRefresh = vi.fn();
    render(
      <PwaUpdateBanner needRefresh hasUnsaved={false} onRefresh={onRefresh} onDismiss={vi.fn()} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("有新版本，点击刷新");
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("有草稿时改为保存提示，不提供刷新按钮", () => {
    const onRefresh = vi.fn();
    const onDismiss = vi.fn();
    render(<PwaUpdateBanner needRefresh hasUnsaved onRefresh={onRefresh} onDismiss={onDismiss} />);

    expect(screen.getByRole("status")).toHaveTextContent("有新版本，保存后再刷新");
    expect(screen.queryByRole("button", { name: "刷新" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "稍后" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
