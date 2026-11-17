import { expect, test } from "@playwright/test";

test("点标签筛选，chip 可关闭", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("记录内容").fill("晨跑 30 分钟 #健康");
  await page.getByRole("button", { name: "记录", exact: true }).click();
  await page.getByLabel("记录内容").fill("加班到很晚 #工作");
  await page.getByRole("button", { name: "记录", exact: true }).click();

  await expect(page.getByText("晨跑 30 分钟 #健康", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "筛选标签 健康" }).click();

  const chip = page.getByLabel("当前筛选");
  await expect(chip).toContainText("#健康");
  await expect(page.getByText("加班到很晚 #工作", { exact: true })).toBeHidden();
  await expect(page.getByText("晨跑 30 分钟 #健康", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "关闭筛选" }).click();

  await expect(page.getByLabel("当前筛选")).toBeHidden();
  await expect(page.getByText("加班到很晚 #工作", { exact: true })).toBeVisible();
});

test("日历选未来日期补记，提交后出现在该天", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "打开日历" }).click();
  const calendar = page.getByRole("dialog");
  await expect(calendar.getByRole("heading", { name: "日历" })).toBeVisible();

  await calendar.getByRole("button", { name: "下个月" }).click();
  const monthTitle = await calendar.locator("h3").textContent();
  const parsed = /^(\d{4})年(\d{1,2})月$/u.exec(monthTitle ?? "");
  if (!parsed) throw new Error(`无法识别月份标题：${monthTitle}`);
  const [, year, month] = parsed;

  await calendar.getByRole("button", { name: new RegExp(`${month}月15日`, "u") }).click();

  const chip = page.getByLabel("当前筛选");
  await expect(chip).toContainText(`${year}年${Number(month)}月15日`);

  await page.getByRole("button", { name: "在这天补记" }).click();
  await expect(page.getByLabel("记录内容")).toBeFocused();

  await page.getByLabel("记录内容").fill("未来日期的补记");
  await page.getByRole("button", { name: "记录", exact: true }).click();

  await expect(page.getByText("未来日期的补记", { exact: true })).toBeVisible();
  await expect(chip).toContainText(`${year}年${Number(month)}月15日`);

  await page.reload();
  await expect(page.getByText("未来日期的补记", { exact: true })).toBeVisible();
});

test("搜索命中后高亮，点高亮进入编辑并保存", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("记录内容").fill("今天开会又超时了");
  await page.getByRole("button", { name: "记录", exact: true }).click();
  await page.getByLabel("记录内容").fill("无关的一条记录");
  await page.getByRole("button", { name: "记录", exact: true }).click();

  await page.getByRole("button", { name: "搜索" }).click();
  await page.getByLabel("搜索记录").fill("开会");

  const highlight = page.locator("mark").filter({ hasText: "开会" });
  await expect(highlight).toBeVisible();
  await expect(page.getByLabel("当前筛选")).toContainText("搜索「开会」");
  await expect(page.getByText("无关的一条记录", { exact: true })).toBeHidden();

  await highlight.click();
  const editor = page.getByRole("dialog");
  await expect(editor.getByRole("heading", { name: "编辑记录" })).toBeVisible();

  await editor.getByLabel("正文").fill("今天开会又超时了，已复盘");
  await editor.getByRole("button", { name: "保存" }).click();

  await expect(page.getByText("今天开会又超时了，已复盘", { exact: true })).toBeVisible();
  await expect(page.locator("mark").filter({ hasText: "开会" })).toBeVisible();
});
