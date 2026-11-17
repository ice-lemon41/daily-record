import { expect, test } from "@playwright/test";

test("冷启动显示主界面且无横向滚动", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "日常记录" })).toBeVisible();
  await expect(page.getByText("脚手架已就绪，接下来会在这里写记录。")).toBeVisible();

  const hasHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalScroll).toBe(false);
});
