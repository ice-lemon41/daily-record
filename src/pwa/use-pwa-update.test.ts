import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePwaUpdate } from "./use-pwa-update";

const original = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");

afterEach(() => {
  vi.restoreAllMocks();
  if (original) Object.defineProperty(navigator, "serviceWorker", original);
  else Reflect.deleteProperty(navigator, "serviceWorker");
});

function stubServiceWorker() {
  const listeners = new Map<string, () => void>();
  const waiting = { postMessage: vi.fn() };
  const installing = {
    state: "installed",
    addEventListener: vi.fn((type: string, listener: () => void) => {
      listeners.set(type, listener);
    }),
  };
  const registration = {
    installing,
    waiting,
    addEventListener: vi.fn((type: string, listener: () => void) => {
      listeners.set(type, listener);
    }),
  };
  const register = vi.fn().mockResolvedValue(registration);

  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { controller: {}, register },
  });

  return { register, waiting, listeners };
}

describe("usePwaUpdate", () => {
  it("注册 sw.js，并在新版本安装完成时提示", async () => {
    const { register, listeners } = stubServiceWorker();
    const { result } = renderHook(() => usePwaUpdate(true));

    await waitFor(() => expect(register).toHaveBeenCalledWith("/sw.js"));
    expect(result.current.needRefresh).toBe(false);

    act(() => {
      listeners.get("updatefound")?.();
      listeners.get("statechange")?.();
    });

    expect(result.current.needRefresh).toBe(true);
  });

  it("已有等待中的版本时直接提示，确认后通知它跳过等待", async () => {
    const { register, waiting } = stubServiceWorker();
    const reload = vi.fn();
    const { result } = renderHook(() => usePwaUpdate(true, reload));

    await waitFor(() => expect(register).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.needRefresh).toBe(true));

    act(() => result.current.update());

    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(result.current.needRefresh).toBe(false);
  });

  it("禁用时不注册 Service Worker", () => {
    const { register } = stubServiceWorker();
    renderHook(() => usePwaUpdate(false));
    expect(register).not.toHaveBeenCalled();
  });
});
