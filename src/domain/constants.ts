/** 单位白名单：只有这里的单位才会触发「新指标建议」。 */
export const UNIT_WHITELIST = [
  "kg",
  "g",
  "斤",
  "cm",
  "mm",
  "公里",
  "km",
  "米",
  "m",
  "步",
  "次",
  "元",
  "块",
  "小时",
  "分钟",
  "分",
  "秒",
  "ml",
  "L",
  "杯",
  "片",
  "页",
] as const;

export const SCHEMA_VERSION = 1;
export const APP_ID = "daily-record";

export const MAX_TAG_LENGTH = 20;
export const MAX_METRIC_NAME_LENGTH = 10;
export const MAX_METRIC_UNIT_LENGTH = 6;

export const SUGGESTION_NAME_MIN = 2;
export const SUGGESTION_NAME_MAX = 8;
export const MAX_METRIC_SUGGESTIONS = 3;

/** 时间线每页条数（PRD FR-05）。 */
export const PAGE_SIZE = 50;

/** 导出文件名前缀，例如 daily-record-20261117-2140.json。 */
export const EXPORT_FILE_PREFIX = "daily-record";
