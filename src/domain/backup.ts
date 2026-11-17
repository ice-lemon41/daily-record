/** 超过 14 天未导出就提醒（PRD FR-12）。 */
export const BACKUP_REMINDER_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BackupStatus {
  lastExportAt: number | null;
  /** 距上次导出的整天数；从未导出时为 null。 */
  days: number | null;
  /** 从未导出或超过 14 天为 true，用于设置图标红点。 */
  needsBackup: boolean;
  label: string;
}

/**
 * 根据上次导出时间生成设置页文案与红点状态。
 * 从未导出也算需要备份，避免新用户一直看不到提醒。
 */
export function describeBackup(
  lastExportAt: number | null | undefined,
  now: number,
): BackupStatus {
  if (lastExportAt === null || lastExportAt === undefined) {
    return { lastExportAt: null, days: null, needsBackup: true, label: "尚未备份" };
  }

  const days = Math.max(0, Math.floor((now - lastExportAt) / DAY_MS));
  return {
    lastExportAt,
    days,
    needsBackup: days > BACKUP_REMINDER_DAYS,
    label: days === 0 ? "上次导出：今天" : `上次导出：${days} 天前`,
  };
}
