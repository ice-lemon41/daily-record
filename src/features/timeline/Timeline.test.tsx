import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/Toast";
import type { AppDb } from "../../db/db";
import { createEntry } from "../../db/repositories/entries";
import { cleanupTestDbs, makeTestDb } from "../../test/db";
import type { EntryFilter } from "../filter";
import { Timeline } from "./Timeline";
import type { TagSelection } from "./TimelineEntry";

function at(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

const NOW = at(2026, 11, 17, 21, 40);

function renderTimeline(
  database: AppDb,
  filter: EntryFilter | null = null,
  onTagClick?: (tag: TagSelection) => void,
) {
  return render(
    <ToastProvider>
      <Timeline database={database} now={NOW} filter={filter} onTagClick={onTagClick} />
    </ToastProvider>,
  );
}

/** 找到正文所在卡片，便于在卡片内定位菜单与编辑按钮。 */
function articleOf(text: string): HTMLElement {
  const article = screen.getByText(text).closest("article");
  if (!article) throw new Error(`找不到包含「${text}」的卡片`);
  return article as HTMLElement;
}

function regionOf(name: string): HTMLElement {
  return screen.getByRole("region", { name });
}

afterEach(async () => {
  cleanup();
  await cleanupTestDbs();
});

describe("Timeline", () => {
  it("没有记录时显示空状态", async () => {
    renderTimeline(makeTestDb());

    expect(await screen.findByText("还没有记录，写下第一条吧。")).toBeInTheDocument();
  });

  it("按今天 / 昨天分组，并保持倒序", async () => {
    const database = makeTestDb();
    await createEntry(database, {
      content: "今天的事",
      occurredAt: at(2026, 11, 17, 10, 0),
      now: NOW,
    });
    await createEntry(database, {
      content: "昨天的事",
      occurredAt: at(2026, 11, 16, 23, 0),
      now: NOW,
    });

    renderTimeline(database);

    expect(await screen.findByRole("heading", { name: "今天" })).toBeInTheDocument();
    expect(within(regionOf("今天")).getByText("今天的事")).toBeInTheDocument();
    expect(within(regionOf("昨天")).getByText("昨天的事")).toBeInTheDocument();
  });

  it("置顶条目只出现在置顶区，不在日期分组里重复", async () => {
    const database = makeTestDb();
    await createEntry(database, {
      content: "置顶的事",
      occurredAt: at(2026, 11, 17, 9, 0),
      now: NOW,
      pinned: 1,
    });
    await createEntry(database, {
      content: "普通的事",
      occurredAt: at(2026, 11, 17, 8, 0),
      now: NOW,
    });

    renderTimeline(database);

    expect(await screen.findByRole("heading", { name: "置顶" })).toBeInTheDocument();
    expect(within(regionOf("置顶")).getByText("置顶的事")).toBeInTheDocument();
    expect(screen.getAllByText("置顶的事")).toHaveLength(1);
    expect(within(regionOf("今天")).queryByText("置顶的事")).toBeNull();
    expect(within(regionOf("今天")).getByText("普通的事")).toBeInTheDocument();
  });

  it("删除需要二次确认，5 秒内可以撤销", async () => {
    const database = makeTestDb();
    await createEntry(database, {
      content: "要删除的记录",
      occurredAt: at(2026, 11, 17, 9, 0),
      now: NOW,
    });

    renderTimeline(database);
    await screen.findByText("要删除的记录");

    fireEvent.click(within(articleOf("要删除的记录")).getByRole("button", { name: "更多操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "删除" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "删除记录" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "删除" }));

    await waitFor(() => expect(screen.queryByText("要删除的记录")).toBeNull());
    expect(screen.getByRole("status")).toHaveTextContent("已删除");
    expect(screen.getByRole("button", { name: "撤销" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "撤销" }));

    expect(await screen.findByText("要删除的记录")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("已恢复"));
  });

  it("菜单可以置顶与取消置顶", async () => {
    const database = makeTestDb();
    await createEntry(database, {
      content: "置顶我",
      occurredAt: at(2026, 11, 17, 9, 0),
      now: NOW,
    });

    renderTimeline(database);
    await screen.findByText("置顶我");

    fireEvent.click(within(articleOf("置顶我")).getByRole("button", { name: "更多操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "置顶" }));

    expect(await screen.findByRole("heading", { name: "置顶" })).toBeInTheDocument();
    expect(within(regionOf("置顶")).getByText("置顶我")).toBeInTheDocument();

    fireEvent.click(within(articleOf("置顶我")).getByRole("button", { name: "更多操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "取消置顶" }));

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "置顶" })).not.toBeInTheDocument(),
    );
    expect(within(regionOf("今天")).getByText("置顶我")).toBeInTheDocument();
  });

  it("在编辑面板改时间后，条目移动到对应分组", async () => {
    const database = makeTestDb();
    await createEntry(database, {
      content: "需要改时间",
      occurredAt: at(2026, 11, 17, 9, 0),
      now: NOW,
    });

    renderTimeline(database);
    await screen.findByText("需要改时间");

    fireEvent.click(within(articleOf("需要改时间")).getByRole("button", { name: /^编辑 / }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "编辑记录" })).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("日期"), {
      target: { value: "2026-11-16" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "编辑记录" })).not.toBeInTheDocument(),
    );
    expect(within(regionOf("昨天")).getByText("需要改时间")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "今天" })).not.toBeInTheDocument();
  });

  it("首屏只加载一页，点「加载更早」后显示更早记录", async () => {
    const database = makeTestDb();
    for (let index = 1; index <= 51; index += 1) {
      await createEntry(database, {
        content: `第 ${index} 条`,
        occurredAt: NOW - index * 60_000,
        now: NOW,
      });
    }

    renderTimeline(database);

    expect(await screen.findByText("第 1 条")).toBeInTheDocument();
    expect(screen.queryByText("第 51 条")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "加载更早" }));

    expect(await screen.findByText("第 51 条")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "加载更早" })).toBeNull();
  });

  it("按天筛选只显示当天，并隐藏置顶区", async () => {
    const database = makeTestDb();
    await createEntry(database, {
      content: "今天的记录",
      occurredAt: at(2026, 11, 17, 10, 0),
      now: NOW,
      pinned: 1,
    });
    await createEntry(database, {
      content: "昨天的记录",
      occurredAt: at(2026, 11, 16, 23, 0),
      now: NOW,
    });

    renderTimeline(database, { kind: "day", dayStart: at(2026, 11, 16) });

    expect(await screen.findByText("昨天的记录")).toBeInTheDocument();
    expect(screen.queryByText("今天的记录")).toBeNull();
    expect(screen.queryByRole("heading", { name: "置顶" })).toBeNull();
  });

  it("按天筛选没有记录时给出补记提示", async () => {
    renderTimeline(makeTestDb(), { kind: "day", dayStart: at(2026, 11, 15) });

    expect(await screen.findByText("这天还没有记录。")).toBeInTheDocument();
    expect(screen.getByText("可以用上方「在这天补记」。")).toBeInTheDocument();
  });

  it("按标签筛选只显示带该标签的记录，点击标签回传选中项", async () => {
    const database = makeTestDb();
    await createEntry(database, { content: "晨跑 #健康", occurredAt: at(2026, 11, 17, 7, 0), now: NOW });
    await createEntry(database, { content: "加班 #工作", occurredAt: at(2026, 11, 17, 6, 0), now: NOW });
    const onTagClick = vi.fn();

    renderTimeline(database, { kind: "tag", name: "健康", nameLower: "健康" }, onTagClick);

    expect(await screen.findByText("晨跑 #健康")).toBeInTheDocument();
    expect(screen.queryByText("加班 #工作")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "筛选标签 健康" }));
    expect(onTagClick).toHaveBeenCalledWith(
      expect.objectContaining({ name: "健康", nameLower: "健康" }),
    );
  });

  it("按标签筛选没有记录时说明该标签为空", async () => {
    renderTimeline(makeTestDb(), { kind: "tag", name: "旅行", nameLower: "旅行" });

    expect(await screen.findByText("没有带 #旅行 的记录。")).toBeInTheDocument();
  });

  it("搜索命中正文时高亮关键词，没有结果时显示空状态", async () => {
    const database = makeTestDb();
    await createEntry(database, {
      content: "今天开会又超时了",
      occurredAt: at(2026, 11, 17, 9, 0),
      now: NOW,
    });

    const { unmount } = renderTimeline(database, { kind: "search", keyword: "开会" });

    const mark = await screen.findByText("开会");
    expect(mark.tagName).toBe("MARK");
    expect(screen.queryByRole("heading", { name: "今天" })).toBeInTheDocument();

    unmount();
    renderTimeline(database, { kind: "search", keyword: "不存在的词" });
    expect(await screen.findByText("没有找到相关记录")).toBeInTheDocument();
  });
});
