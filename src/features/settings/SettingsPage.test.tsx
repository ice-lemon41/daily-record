import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import { type AppDb, createDb } from "../../db/db";
import { createEntry } from "../../db/repositories/entries";
import { getKv, setKv } from "../../db/repositories/kv";
import { createMetric } from "../../db/repositories/metrics";
import { LAST_EXPORT_AT_KV_KEY, SCHEMA_VERSION } from "../../domain/constants";
import { dateKey } from "../../domain/dates";
import type { ExportBundle } from "../../domain/types";
import { downloadText } from "./download";
import { SettingsPage } from "./SettingsPage";

vi.mock("./download", () => ({ downloadText: vi.fn() }));

const NOW = new Date(2026, 10, 17, 21, 40).getTime();
const downloadMock = vi.mocked(downloadText);

let db: AppDb;

beforeEach(() => {
  db = createDb(`test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  vi.clearAllMocks();
  db.close();
  await Dexie.delete(db.name);
  cleanup();
});

function renderSettings(database: AppDb = db, now = NOW) {
  return render(
    <ToastProvider>
      <SettingsPage database={database} now={now} onClose={() => {}} />
    </ToastProvider>,
  );
}

function makeBundle(overrides: Partial<ExportBundle> = {}): ExportBundle {
  return {
    schemaVersion: SCHEMA_VERSION,
    app: "daily-record",
    exportedAt: NOW,
    metrics: [
      {
        id: crypto.randomUUID(),
        name: "体重",
        unit: "kg",
        archived: false,
        createdAt: NOW - 10_000,
      },
    ],
    entries: [
      {
        id: crypto.randomUUID(),
        content: "补记 体重 70kg #健康",
        occurredAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
        pinned: false,
        extra: { ignoredSuggestions: [] },
      },
    ],
    ...overrides,
  };
}

describe("SettingsPage 备份与导出", () => {
  it("从未导出时显示尚未备份和版本号", async () => {
    renderSettings();

    expect(await screen.findByText("尚未备份")).toBeInTheDocument();
    expect(screen.getByText("需要备份")).toBeInTheDocument();
    expect(screen.getByText("版本 0.1.0")).toBeInTheDocument();
  });

  it("导出 JSON 后写入 lastExportAt 并提示今天已备份", async () => {
    await createEntry(db, { content: "今天过得很不错", occurredAt: NOW, now: NOW });
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "导出 JSON" }));

    await waitFor(() => expect(downloadMock).toHaveBeenCalledTimes(1));
    await waitFor(async () => expect(await getKv(db, LAST_EXPORT_AT_KV_KEY)).toBeTypeOf("number"));

    const payload = downloadMock.mock.calls[0]?.[0];
    expect(payload?.fileName).toMatch(/^daily-record-\d{8}-\d{4}\.json$/u);
    expect(payload?.mimeType).toBe("application/json");
    const bundle = JSON.parse(payload?.text ?? "") as ExportBundle;
    expect(bundle.schemaVersion).toBe(SCHEMA_VERSION);
    expect(bundle.entries).toHaveLength(1);
    expect(bundle.entries[0]?.content).toBe("今天过得很不错");
    expect(bundle.entries[0]?.pinned).toBe(false);

    expect(await screen.findByText("上次导出：今天")).toBeInTheDocument();
    expect(screen.queryByText("需要备份")).toBeNull();
    expect(await screen.findByRole("status")).toHaveTextContent("JSON 备份已导出");
  });

  it("导出 Markdown 不计入备份", async () => {
    await createEntry(db, { content: "晨跑 #健康", occurredAt: NOW, now: NOW });
    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: "导出 Markdown" }));

    await waitFor(() => expect(downloadMock).toHaveBeenCalledTimes(1));
    const payload = downloadMock.mock.calls[0]?.[0];
    expect(payload?.fileName).toMatch(/^daily-record-\d{8}-\d{4}\.md$/u);
    expect(payload?.mimeType).toBe("text/markdown");
    expect(payload?.text).toContain("晨跑 #健康");

    expect(await getKv(db, LAST_EXPORT_AT_KV_KEY)).toBeUndefined();
    expect(screen.getByText("尚未备份")).toBeInTheDocument();
  });

  it("超过 14 天显示提醒，并带上天数", async () => {
    const fifteenDaysAgo = NOW - 15 * 24 * 60 * 60 * 1000;
    await setKv(db, LAST_EXPORT_AT_KV_KEY, fifteenDaysAgo);
    renderSettings();

    expect(await screen.findByText("上次导出：15 天前")).toBeInTheDocument();
    expect(screen.getByText("需要备份")).toBeInTheDocument();
  });
});

describe("SettingsPage 导入", () => {
  async function chooseFile(file: File) {
    fireEvent.change(screen.getByLabelText("选择备份文件"), { target: { files: [file] } });
    return screen.findByRole("heading", { name: "导入预览" });
  }

  it("预览后覆盖导入并重建标签与指标，导入前先下载保险备份", async () => {
    await createEntry(db, { content: "旧数据", occurredAt: NOW - 86_400_000, now: NOW });
    const bundle = makeBundle();
    renderSettings();

    const dialog = await chooseFile(
      new File([JSON.stringify(bundle)], "daily-record-backup.json", {
        type: "application/json",
      }),
    );
    const preview = screen.getByRole("dialog");

    expect(within(preview).getByText("1 条")).toBeInTheDocument();
    expect(within(preview).getByText("1 个")).toBeInTheDocument();
    expect(within(preview).getByText(new RegExp(dateKey(NOW), "u"))).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();

    fireEvent.click(within(preview).getByRole("button", { name: "导入并覆盖" }));

    expect(await screen.findByRole("status")).toHaveTextContent("导入完成：1 条记录、1 个指标");
    await waitFor(async () => expect(await db.entries.count()).toBe(1));

    const rows = await db.entries.toArray();
    expect(rows[0]?.content).toBe("补记 体重 70kg #健康");
    expect(await db.entryTags.count()).toBe(1);
    expect(await db.entryMetrics.count()).toBe(1);

    // 覆盖前的自动保险导出只下载一次，且不算用户备份。
    expect(downloadMock).toHaveBeenCalledTimes(1);
    expect(downloadMock.mock.calls[0]?.[0].text).toContain("旧数据");
    expect(await getKv(db, LAST_EXPORT_AT_KV_KEY)).toBeUndefined();
    expect(screen.queryByRole("heading", { name: "导入预览" })).toBeNull();
  });

  it("损坏文件明确报错且原数据完好", async () => {
    await createEntry(db, { content: "不能丢的数据", occurredAt: NOW, now: NOW });
    renderSettings();

    fireEvent.change(screen.getByLabelText("选择备份文件"), {
      target: { files: [new File(["这不是 JSON"], "broken.json", { type: "application/json" })] },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("文件内容损坏，无法解析");
    expect(await db.entries.count()).toBe(1);
    expect(downloadMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "导入预览" })).toBeNull();
  });

  it("schemaVersion 不匹配时直接拒绝", async () => {
    renderSettings();

    fireEvent.change(screen.getByLabelText("选择备份文件"), {
      target: {
        files: [
          new File([JSON.stringify({ ...makeBundle(), schemaVersion: 2 })], "future.json", {
            type: "application/json",
          }),
        ],
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("schemaVersion");
    expect(screen.queryByRole("heading", { name: "导入预览" })).toBeNull();
  });
});

describe("SettingsPage 指标管理", () => {
  it("新增、编辑、归档与恢复指标", async () => {
    renderSettings();

    fireEvent.change(screen.getByLabelText("指标名称"), { target: { value: "体重" } });
    fireEvent.change(screen.getByLabelText("指标单位"), { target: { value: "kg" } });
    fireEvent.click(screen.getByRole("button", { name: "新增指标" }));

    const list = await screen.findByRole("list", { name: "指标列表" });
    expect(within(list).getByText("体重")).toBeInTheDocument();
    expect(within(list).getByText("/ kg")).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("已新增指标");

    fireEvent.click(within(list).getByRole("button", { name: "编辑指标 体重" }));
    const editDialog = screen.getByRole("dialog");
    fireEvent.change(within(editDialog).getByLabelText("名称"), { target: { value: "重量" } });
    fireEvent.click(within(editDialog).getByRole("button", { name: "保存指标" }));

    expect(await screen.findByRole("button", { name: "编辑指标 重量" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "归档指标 重量" }));
    expect(await screen.findByText("已归档")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "恢复指标 重量" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "恢复指标 重量" }));
    await waitFor(() => expect(screen.queryByText("已归档")).toBeNull());
    expect(screen.getByRole("button", { name: "归档指标 重量" })).toBeInTheDocument();
  });

  it("重复名称显示指标已存在", async () => {
    await createMetric(db, { name: "体重", unit: "kg" }, NOW);
    renderSettings();

    fireEvent.change(screen.getByLabelText("指标名称"), { target: { value: "体重" } });
    fireEvent.click(screen.getByRole("button", { name: "新增指标" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("指标「体重」已存在");
    expect(await db.metrics.count()).toBe(1);
  });
});
