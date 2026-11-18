import { expect, test } from "@playwright/test";

test("PWA manifest 与 Service Worker 资源可访问", async ({ page }) => {
  await page.goto("/");

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBeTruthy();
  const manifestUrl = new URL(manifestHref ?? "", page.url());
  const manifestResponse = await page.request.get(manifestUrl.href);
  expect(manifestResponse.ok()).toBeTruthy();

  const manifest = (await manifestResponse.json()) as {
    name: string;
    short_name: string;
    display: string;
    start_url: string;
    scope: string;
    theme_color: string;
    icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
  };
  expect(manifest.name).toBe("日常记录");
  expect(manifest.short_name).toBe("日常");
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("./");
  expect(manifest.scope).toBe("./");
  expect(manifest.theme_color).toBe("#ffffff");

  expect(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.type === "image/png")).toBe(
    true,
  );
  expect(
    manifest.icons.some(
      (icon) =>
        icon.sizes === "512x512" && icon.purpose === "maskable" && icon.type === "image/png",
    ),
  ).toBe(true);

  for (const icon of manifest.icons) {
    const response = await page.request.get(new URL(icon.src, manifestUrl).href);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("image/png");
  }

  const swResponse = await page.request.get(new URL("sw.js", page.url()).href);
  expect(swResponse.ok()).toBeTruthy();
  expect(await swResponse.text()).toContain("precache");
});

test("320px 窄屏无横向滚动，输入框与提交按钮可见", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/");

  await expect(page.getByLabel("记录内容")).toBeVisible();
  await expect(page.getByRole("button", { name: "记录", exact: true })).toBeVisible();

  const hasHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalScroll).toBe(false);
});
