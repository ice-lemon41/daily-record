import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AppDb, createDb } from "../db";
import {
  archiveMetric,
  createMetric,
  listMetrics,
  MetricNameConflictError,
  MetricValidationError,
  normalizeMetricInput,
  updateMetric,
} from "./metrics";

let db: AppDb;

beforeEach(() => {
  db = createDb(`test-${crypto.randomUUID()}`);
});

afterEach(async () => {
  db.close();
  await Dexie.delete(db.name);
});

describe("normalizeMetricInput", () => {
  it("去首尾空白并生成小写比较键", () => {
    expect(normalizeMetricInput({ name: "  Weight ", unit: " kg " })).toEqual({
      name: "Weight",
      nameLower: "weight",
      unit: "kg",
    });
  });

  it("允许空单位", () => {
    expect(normalizeMetricInput({ name: "打卡", unit: "  " }).unit).toBe("");
  });

  it("拒绝非法名称与单位", () => {
    expect(() => normalizeMetricInput({ name: " ", unit: "" })).toThrow(MetricValidationError);
    expect(() => normalizeMetricInput({ name: "一二三四五六七八九十一", unit: "" })).toThrow(
      /最多 10 个字符/,
    );
    expect(() => normalizeMetricInput({ name: "体#重", unit: "" })).toThrow(/不能包含 #/);
    expect(() => normalizeMetricInput({ name: "体重", unit: "1234567" })).toThrow(/最多 6 个字符/);
  });
});

describe("createMetric", () => {
  it("创建启用的指标", async () => {
    const metric = await createMetric(db, { name: "体重", unit: "kg" }, 1000);

    expect(metric).toMatchObject({
      name: "体重",
      nameLower: "体重",
      unit: "kg",
      archived: 0,
      createdAt: 1000,
    });
    expect(await db.metrics.count()).toBe(1);
  });

  it("名称不区分大小写且不可重复", async () => {
    await createMetric(db, { name: "Weight", unit: "kg" }, 1000);

    await expect(createMetric(db, { name: "weight", unit: "kg" })).rejects.toBeInstanceOf(
      MetricNameConflictError,
    );
    expect(await db.metrics.count()).toBe(1);
  });
});

describe("listMetrics", () => {
  it("按创建时间排序，默认隐藏归档", async () => {
    const third = await createMetric(db, { name: "三", unit: "" }, 3000);
    await createMetric(db, { name: "一", unit: "次" }, 1000);
    await createMetric(db, { name: "二", unit: "元" }, 2000);
    await archiveMetric(db, third.id);

    expect((await listMetrics(db)).map((metric) => metric.name)).toEqual(["一", "二"]);
    expect((await listMetrics(db, { includeArchived: true })).map((metric) => metric.name)).toEqual(
      ["一", "二", "三"],
    );
  });
});

describe("updateMetric", () => {
  it("更新名称与单位", async () => {
    const metric = await createMetric(db, { name: "体重", unit: "kg" }, 1000);

    const updated = await updateMetric(db, metric.id, { name: "重量", unit: "斤" });

    expect(updated).toMatchObject({ name: "重量", nameLower: "重量", unit: "斤", createdAt: 1000 });
    expect(await db.metrics.get(metric.id)).toMatchObject({ name: "重量", unit: "斤" });
  });

  it("空补丁保持原值", async () => {
    const metric = await createMetric(db, { name: "体重", unit: "kg" }, 1000);
    expect(await updateMetric(db, metric.id, {})).toMatchObject({ name: "体重", unit: "kg" });
  });

  it("拒绝与其它指标重名", async () => {
    await createMetric(db, { name: "体重", unit: "kg" }, 1000);
    const spend = await createMetric(db, { name: "花费", unit: "元" }, 2000);

    await expect(updateMetric(db, spend.id, { name: " 体重 " })).rejects.toBeInstanceOf(
      MetricNameConflictError,
    );
  });

  it("允许只改大小写", async () => {
    const metric = await createMetric(db, { name: "weight", unit: "kg" }, 1000);
    expect(await updateMetric(db, metric.id, { name: "Weight" })).toMatchObject({
      name: "Weight",
      nameLower: "weight",
    });
  });

  it("条目不存在或校验失败时报错", async () => {
    await expect(updateMetric(db, "missing", { name: "x" })).rejects.toBeInstanceOf(
      MetricValidationError,
    );

    const metric = await createMetric(db, { name: "体重", unit: "kg" }, 1000);
    await expect(updateMetric(db, metric.id, { name: "" })).rejects.toBeInstanceOf(
      MetricValidationError,
    );
  });
});

describe("archiveMetric", () => {
  it("归档与恢复", async () => {
    const metric = await createMetric(db, { name: "体重", unit: "kg" }, 1000);

    expect((await archiveMetric(db, metric.id)).archived).toBe(1);
    expect((await archiveMetric(db, metric.id, false)).archived).toBe(0);
  });

  it("条目不存在时报错", async () => {
    await expect(archiveMetric(db, "missing")).rejects.toBeInstanceOf(MetricValidationError);
  });
});
