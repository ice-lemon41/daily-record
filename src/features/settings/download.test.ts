import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadText } from "./download";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("downloadText", () => {
  it("把文本包成 UTF-8 Blob 并触发下载", async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn((_blob: Blob) => "blob:daily-record");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = createObjectURL;
        static revokeObjectURL = revokeObjectURL;
      },
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    downloadText({
      fileName: "daily-record-20261117-2140.json",
      text: '{"内容":"中文"}',
      mimeType: "application/json",
    });

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe("application/json;charset=utf-8");
    expect(await blob.text()).toBe('{"内容":"中文"}');
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector("a")).toBeNull();

    vi.advanceTimersByTime(0);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:daily-record");
  });
});
