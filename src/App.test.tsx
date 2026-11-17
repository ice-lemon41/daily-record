import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import App from "./App";
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
});
