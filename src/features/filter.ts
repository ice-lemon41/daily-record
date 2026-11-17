/** 三种筛选互斥（PRD FR-07-3）：按天、按标签、关键词搜索。 */
export type EntryFilter =
  | { kind: "day"; dayStart: number }
  | { kind: "tag"; name: string; nameLower: string }
  | { kind: "search"; keyword: string };
