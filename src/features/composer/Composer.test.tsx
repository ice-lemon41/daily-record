import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ToastProvider } from "../../components/Toast";
import type { AppDb } from "../../db/db";
import { getKv, setKv } from "../../db/repositories/kv";
import { createMetric } from "../../db/repositories/metrics";
import { DRAFT_KV_KEY } from "../../domain/constants";
import { formatClock } from "../../domain/dates";
import { cleanupTestDbs, makeTestDb } from "../../test/db";
import { Composer } from "./Composer";

function at(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

const NOW = at(2026, 11, 17, 21, 40);

function renderComposer(database: AppDb) {
  return render(
    <ToastProvider>
      <Composer database={database} now={NOW} />
    </ToastProvider>,
  );
}

async function waitForHydration() {
  await waitFor(() => {
    expect(screen.getByLabelText("记录内容")).toBeInTheDocument();
  });
}

afterEach(async () => {
  cleanup();
  await cleanupTestDbs();
});

describe("Composer", () => {
  it("实时预览标签与指标", async () => {
    const database = makeTestDb();
    await createMetric(database, { name: "体重", unit: "kg" }, 1);
    renderComposer(database);
    await waitForHydration();

    fireEvent.change(screen.getByLabelText("记录内容"), {
      target: { value: "今天 #健康 体重 70kg" },
    });

    expect(await screen.findByText("#健康")).toBeInTheDocument();
    expect(await screen.findByText("体重 70 kg")).toBeInTheDocument();
  });

  it("提交后清空输入、删除草稿并提示", async () => {
    const database = makeTestDb();
    renderComposer(database);
    await waitForHydration();

    fireEvent.change(screen.getByLabelText("记录内容"), {
      target: { value: "今天挺好" },
    });
    fireEvent.click(screen.getByRole("button", { name: "记录" }));

    await waitFor(async () => {
      expect(await database.entries.count()).toBe(1);
    });
    const [entry] = await database.entries.toArray();
    expect(entry?.content).toBe("今天挺好");
    expect(Math.abs((entry?.occurredAt ?? 0) - Date.now())).toBeLessThan(5000);
    expect(screen.getByLabelText("记录内容")).toHaveValue("");
    expect(await screen.findByRole("status")).toHaveTextContent("已记录");
    await waitFor(async () => {
      expect(await getKv(database, DRAFT_KV_KEY)).toBeUndefined();
    });
  });

  it("空正文提交不写入、不报错", async () => {
    const database = makeTestDb();
    renderComposer(database);
    await waitForHydration();

    expect(screen.getByRole("button", { name: "记录" })).toBeDisabled();
    fireEvent.keyDown(screen.getByLabelText("记录内容"), {
      key: "Enter",
      ctrlKey: true,
    });

    expect(await database.entries.count()).toBe(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Ctrl/Cmd + Enter 提交", async () => {
    const database = makeTestDb();
    renderComposer(database);
    await waitForHydration();

    fireEvent.change(screen.getByLabelText("记录内容"), {
      target: { value: "快捷键提交" },
    });
    fireEvent.keyDown(screen.getByLabelText("记录内容"), {
      key: "Enter",
      ctrlKey: true,
    });

    await waitFor(async () => {
      expect(await database.entries.count()).toBe(1);
    });
  });

  it("改时间归属后提交，条目落在指定日期且随后恢复为现在", async () => {
    const database = makeTestDb();
    renderComposer(database);
    await waitForHydration();

    fireEvent.click(screen.getByRole("button", { name: /^现在 / }));
    expect(screen.getByRole("heading", { name: "记录时间" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("日期"), { target: { value: "2026-11-16" } });
    fireEvent.change(screen.getByLabelText("时间"), { target: { value: "09:30" } });
    fireEvent.click(screen.getByRole("button", { name: "确定" }));

    expect(screen.getByRole("button", { name: "昨天 09:30" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("记录内容"), {
      target: { value: "补记一条" },
    });
    fireEvent.click(screen.getByRole("button", { name: "记录" }));

    await waitFor(async () => {
      expect(await database.entries.count()).toBe(1);
    });
    const [entry] = await database.entries.toArray();
    expect(entry?.occurredAt).toBe(at(2026, 11, 16, 9, 30));
    expect(screen.getByRole("button", { name: `现在 ${formatClock(NOW)}` })).toBeInTheDocument();
  });

  it("恢复草稿并提示", async () => {
    const database = makeTestDb();
    await setKv(database, DRAFT_KV_KEY, { content: "未提交的草稿", occurredAt: null });
    renderComposer(database);

    expect(await screen.findByDisplayValue("未提交的草稿")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("已恢复未提交的内容");
  });
});
