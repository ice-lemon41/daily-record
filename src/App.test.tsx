import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";
import { createEntry } from "./db/repositories/entries";
import { dateKey, formatClock, startOfLocalDay } from "./domain/dates";
import { cleanupTestDbs, makeTestDb } from "./test/db";

afterEach(async () => {
  cleanup();
  await cleanupTestDbs();
});

describe("App", () => {
  it("渲染标题与空状态", async () => {
    render(<App database={makeTestDb()} />);

    expect(screen.getByRole("heading", { name: "日常记录" })).toBeInTheDocument();
    expect(await screen.findByText("还没有记录，写下第一条吧。")).toBeInTheDocument();
  });

  it("写一条后立即出现在时间线", async () => {
    const database = makeTestDb();
    render(<App database={database} />);
    await screen.findByText("还没有记录，写下第一条吧。");

    fireEvent.change(screen.getByLabelText("记录内容"), {
      target: { value: "今天过得不错" },
    });
    fireEvent.click(screen.getByRole("button", { name: "记录" }));

    expect(await screen.findByText("今天过得不错")).toBeInTheDocument();
    expect(await database.entries.count()).toBe(1);
  });

  it("点击标签后只显示该标签，chip 可关闭", async () => {
    const database = makeTestDb();
    const now = Date.now();
    await createEntry(database, {
      content: "晨跑 #健康",
      occurredAt: now,
      now,
    });
    await createEntry(database, {
      content: "加班 #工作",
      occurredAt: now - 60_000,
      now,
    });

    render(<App database={database} />);
    await screen.findByText("晨跑 #健康");

    fireEvent.click(screen.getByRole("button", { name: "筛选标签 健康" }));

    expect(screen.getByLabelText("当前筛选")).toHaveTextContent("#健康");
    await waitFor(() => expect(screen.queryByText("加班 #工作")).toBeNull());
    expect(screen.getByText("晨跑 #健康")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭筛选" }));

    expect(screen.queryByLabelText("当前筛选")).toBeNull();
    expect(await screen.findByText("加班 #工作")).toBeInTheDocument();
  });

  it("搜索后只显示命中的记录并高亮关键词", async () => {
    const database = makeTestDb();
    const now = Date.now();
    await createEntry(database, { content: "今天开会又超时了", occurredAt: now, now });
    await createEntry(database, { content: "无关的一条", occurredAt: now - 60_000, now });

    render(<App database={database} />);
    await screen.findByText("无关的一条");

    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    fireEvent.change(screen.getByLabelText("搜索记录"), { target: { value: "开会" } });

    const mark = await screen.findByText("开会");
    expect(mark.tagName).toBe("MARK");
    expect(screen.getByLabelText("当前筛选")).toHaveTextContent("搜索「开会」");
    await waitFor(() => expect(screen.queryByText("无关的一条")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "关闭搜索" }));
    expect(screen.queryByLabelText("当前筛选")).toBeNull();
    expect(await screen.findByText("无关的一条")).toBeInTheDocument();
  });

  it("标签筛选下打开搜索会清除标签筛选", async () => {
    const database = makeTestDb();
    const now = Date.now();
    await createEntry(database, { content: "晨跑 #健康", occurredAt: now, now });

    render(<App database={database} />);
    await screen.findByText("晨跑 #健康");

    fireEvent.click(screen.getByRole("button", { name: "筛选标签 健康" }));
    expect(screen.getByLabelText("当前筛选")).toHaveTextContent("#健康");

    fireEvent.click(screen.getByRole("button", { name: "搜索" }));

    expect(screen.getByLabelText("搜索记录")).toBeInTheDocument();
    expect(screen.queryByLabelText("当前筛选")).toBeNull();
  });

  it("日历选天后可以补记，提交后落在该天；再次选同一天取消筛选", async () => {
    const database = makeTestDb();
    const now = Date.now();
    const todayStart = startOfLocalDay(now);
    await createEntry(database, {
      content: "今天的记录",
      occurredAt: now,
      now,
    });

    render(<App database={database} />);
    await screen.findByText("今天的记录");

    fireEvent.click(screen.getByRole("button", { name: "打开日历" }));
    const calendar = screen.getByRole("dialog");
    const todayButton = within(calendar)
      .getAllByRole("button")
      .find((button) => button.getAttribute("aria-current") === "date");
    if (!todayButton) throw new Error("日历里找不到今天");
    fireEvent.click(todayButton);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("当前筛选")).toHaveTextContent(
      new Date(now).getFullYear().toString(),
    );

    fireEvent.click(screen.getByRole("button", { name: "在这天补记" }));
    expect(screen.getByRole("button", { name: `今天 ${formatClock(now)}` })).toBeInTheDocument();
    expect(screen.getByLabelText("记录内容")).toHaveFocus();

    fireEvent.change(screen.getByLabelText("记录内容"), {
      target: { value: "补记内容" },
    });
    fireEvent.click(screen.getByRole("button", { name: "记录" }));

    await waitFor(async () => {
      const rows = await database.entries.toArray();
      expect(rows).toHaveLength(2);
    });
    const added = (await database.entries.toArray()).find((entry) => entry.content === "补记内容");
    expect(dateKey(added?.occurredAt ?? 0)).toBe(dateKey(todayStart));
    expect(await screen.findByText("补记内容")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开日历" }));
    const reopened = screen.getByRole("dialog");
    const selected = within(reopened)
      .getAllByRole("button")
      .find((button) => button.getAttribute("aria-pressed") === "true");
    if (!selected) throw new Error("日历里找不到已选日期");
    fireEvent.click(selected);

    expect(screen.queryByLabelText("当前筛选")).toBeNull();
  });
});
