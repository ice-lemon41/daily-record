import { expect, test } from "@playwright/test";

test("写一条记录，刷新后仍在", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("记录内容").fill("今天散步 30 分钟 #健康");
  await page.getByRole("button", { name: "记录", exact: true }).click();

  const entry = page.getByText("今天散步 30 分钟 #健康", { exact: true });
  await expect(entry).toBeVisible();
  await expect(page.getByLabel("记录内容")).toHaveValue("");

  await page.reload();
  await expect(page.getByText("今天散步 30 分钟 #健康", { exact: true })).toBeVisible();
});

test("删除可以撤销，5 秒后不再提供撤销", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("记录内容").fill("要删除的记录");
  await page.getByRole("button", { name: "记录", exact: true }).click();

  const entry = page.getByText("要删除的记录", { exact: true });
  await expect(entry).toBeVisible();

  async function deleteEntry() {
    await page.getByRole("button", { name: "更多操作" }).click();
    await page.getByRole("menuitem", { name: "删除" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "删除记录" })).toBeVisible();
    await dialog.getByRole("button", { name: "删除" }).click();
    await expect(page.getByRole("status")).toContainText("已删除");
  }

  await deleteEntry();
  await expect(entry).toBeHidden();

  await page.getByRole("button", { name: "撤销" }).click();
  await expect(page.getByRole("status")).toContainText("已恢复");
  await expect(entry).toBeVisible();

  await deleteEntry();
  await expect(page.getByRole("button", { name: "撤销" })).toBeHidden({ timeout: 10_000 });
  await expect(entry).toBeHidden();
});
