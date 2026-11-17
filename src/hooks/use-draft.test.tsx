import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getKv } from "../db/repositories/kv";
import { DRAFT_KV_KEY } from "../domain/constants";
import { cleanupTestDbs, makeTestDb } from "../test/db";
import { useDraft } from "./use-draft";

afterEach(async () => {
  cleanup();
  await cleanupTestDbs();
});

describe("useDraft", () => {
  it("内容变化后写入草稿", async () => {
    const db = makeTestDb();
    const { result } = renderHook(() => useDraft(db, { debounceMs: 10 }));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.setContent("写了一半"));

    await waitFor(async () => {
      expect(await getKv(db, DRAFT_KV_KEY)).toEqual({ content: "写了一半", occurredAt: null });
    });
  });

  it("重新打开时恢复正文与时间归属，并只提示一次", async () => {
    const db = makeTestDb();
    await act(async () => {
      await db.kv.put({
        key: DRAFT_KV_KEY,
        value: { content: "旧草稿", occurredAt: 123 },
      });
    });
    const onRestored = vi.fn();

    const { result } = renderHook(() => useDraft(db, { onRestored, debounceMs: 10 }));

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.content).toBe("旧草稿");
    expect(result.current.occurredAt).toBe(123);
    expect(onRestored).toHaveBeenCalledTimes(1);
  });

  it("清空后删除草稿", async () => {
    const db = makeTestDb();
    const { result } = renderHook(() => useDraft(db, { debounceMs: 10 }));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.setContent("要清掉"));
    await waitFor(async () => {
      expect(await getKv(db, DRAFT_KV_KEY)).toBeDefined();
    });

    act(() => result.current.clear());

    expect(result.current.content).toBe("");
    expect(result.current.occurredAt).toBeNull();
    await waitFor(async () => {
      expect(await getKv(db, DRAFT_KV_KEY)).toBeUndefined();
    });
  });

  it("只改时间归属也保存草稿", async () => {
    const db = makeTestDb();
    const { result } = renderHook(() => useDraft(db, { debounceMs: 10 }));
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.setOccurredAt(456));

    await waitFor(async () => {
      expect(await getKv(db, DRAFT_KV_KEY)).toEqual({ content: "", occurredAt: 456 });
    });
  });
});
