import { describe, expect, it } from "vitest";
import { BACKUP_REMINDER_DAYS, describeBackup } from "./backup";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 17, 21, 40).getTime();

describe("describeBackup", () => {
  it("从未导出时提示尚未备份并显示红点", () => {
    expect(describeBackup(null, NOW)).toEqual({
      lastExportAt: null,
      days: null,
      needsBackup: true,
      label: "尚未备份",
    });
    expect(describeBackup(undefined, NOW).needsBackup).toBe(true);
  });

  it("当天导出显示今天且不提醒", () => {
    const status = describeBackup(NOW - 60_000, NOW);
    expect(status).toMatchObject({ days: 0, needsBackup: false, label: "上次导出：今天" });
  });

  it("第 14 天仍不提醒，第 15 天开始提醒", () => {
    expect(describeBackup(NOW - BACKUP_REMINDER_DAYS * DAY_MS, NOW)).toMatchObject({
      days: 14,
      needsBackup: false,
    });
    expect(describeBackup(NOW - (BACKUP_REMINDER_DAYS + 1) * DAY_MS, NOW)).toMatchObject({
      days: 15,
      needsBackup: true,
      label: "上次导出：15 天前",
    });
  });

  it("不足一天按 0 天算，未来时间不显示负数", () => {
    expect(describeBackup(NOW - DAY_MS + 1, NOW).days).toBe(0);
    expect(describeBackup(NOW + DAY_MS, NOW)).toMatchObject({ days: 0, needsBackup: false });
  });
});
