import { expect, test } from "@playwright/test";

test("冷启动显示主界面且无横向滚动", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "日常记录" })).toBeVisible();
  await expect(page.getByLabel("记录内容")).toBeVisible();
  await expect(page.getByRole("button", { name: "记录" })).toBeVisible();
  await expect(page.getByText("还没有记录，写下第一条吧。")).toBeVisible();

  const hasHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalScroll).toBe(false);
});
