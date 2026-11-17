import { expect, type Page, test } from "@playwright/test";

const DB_NAME = "daily-record";

/** 关掉应用页面后，用同源静态文件页删除整个 IndexedDB，模拟「换设备 / 清缓存」。 */
async function deleteAppDatabase(page: Page) {
  await page.goto("/favicon.svg");
  await page.evaluate(
    (name) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("IndexedDB 删除被阻塞"));
      }),
    DB_NAME,
  );
}

test("导出 JSON 后清空数据，再导入可完整恢复", async ({ page, context }, testInfo) => {
  await page.goto("/");

  // 先建一个指标，确保导出文件包含指标定义。
  await page.getByRole("button", { name: /设置/u }).click();
  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
  await page.getByLabel("指标名称").fill("体重");
  await page.getByLabel("指标单位").fill("kg");
  await page.getByRole("button", { name: "新增指标" }).click();
  await expect(page.getByRole("status")).toContainText("已新增指标");
  await page.getByRole("button", { name: "返回主界面" }).click();

  await page.getByLabel("记录内容").fill("备份测试 体重 70kg #健康");
  await page.getByRole("button", { name: "记录", exact: true }).click();
  await expect(page.getByText("备份测试 体重 70kg #健康", { exact: true })).toBeVisible();
  await expect(page.getByText("体重 70 kg", { exact: true })).toBeVisible();

  // 置顶也必须在 round-trip 后保留。
  await page.getByRole("button", { name: "更多操作" }).click();
  await page.getByRole("menuitem", { name: "置顶" }).click();
  await expect(page.getByRole("heading", { name: "置顶" })).toBeVisible();

  await page.getByRole("button", { name: /设置/u }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON" }).click();
  const download = await downloadPromise;
  const backupPath = testInfo.outputPath("daily-record-backup.json");
  await download.saveAs(backupPath);
  await expect(page.getByText("上次导出：今天")).toBeVisible();

  await page.close();
  const cleaner = await context.newPage();
  await deleteAppDatabase(cleaner);
  await cleaner.close();

  const restored = await context.newPage();
  await restored.goto("/");
  await expect(restored.getByText("还没有记录，写下第一条吧。")).toBeVisible();

  await restored.getByRole("button", { name: /设置/u }).click();
  await restored.getByLabel("选择备份文件").setInputFiles(backupPath);

  const preview = restored.getByRole("dialog");
  await expect(preview.getByRole("heading", { name: "导入预览" })).toBeVisible();
  await expect(preview.getByText("1 条")).toBeVisible();
  await expect(preview.getByText("1 个")).toBeVisible();

  await preview.getByRole("button", { name: "导入并覆盖" }).click();
  await expect(restored.getByRole("status")).toContainText("导入完成：1 条记录、1 个指标");

  await restored.getByRole("button", { name: "返回主界面" }).click();
  await expect(restored.getByRole("heading", { name: "置顶" })).toBeVisible();
  await expect(restored.getByText("备份测试 体重 70kg #健康", { exact: true })).toBeVisible();
  await expect(restored.getByText("体重 70 kg", { exact: true })).toBeVisible();

  await restored.getByRole("button", { name: /设置/u }).click();
  const metrics = restored.getByRole("list", { name: "指标列表" });
  await expect(metrics.getByText("体重")).toBeVisible();
  await expect(metrics.getByText("/ kg")).toBeVisible();
});

test("导入损坏文件会明确报错，原数据不被破坏", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("记录内容").fill("导入前不能丢的数据");
  await page.getByRole("button", { name: "记录", exact: true }).click();
  await expect(page.getByText("导入前不能丢的数据", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /设置/u }).click();
  await page.getByLabel("选择备份文件").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("这不是合法的备份文件"),
  });

  await expect(page.getByRole("alert")).toContainText("文件内容损坏，无法解析");
  await expect(page.getByRole("heading", { name: "导入预览" })).toBeHidden();

  await page.getByRole("button", { name: "返回主界面" }).click();
  await expect(page.getByText("导入前不能丢的数据", { exact: true })).toBeVisible();
});
