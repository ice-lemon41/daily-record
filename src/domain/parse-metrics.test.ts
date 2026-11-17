import { describe, expect, it } from "vitest";
import { MAX_METRIC_SUGGESTIONS } from "./constants";
import {
  filterIgnoredSuggestions,
  type MetricDefinition,
  normalizeUnit,
  parseMetrics,
  suggestionKey,
  suggestMetrics,
} from "./parse-metrics";

const WEIGHT: MetricDefinition = { id: "m-weight", name: "体重", unit: "kg" };
const SPEND: MetricDefinition = { id: "m-spend", name: "花费", unit: "元" };

describe("normalizeUnit", () => {
  it("做 NFKC 归一化并转小写", () => {
    expect(normalizeUnit("ＫＧ")).toBe("kg");
    expect(normalizeUnit(" Kg ")).toBe(" kg ");
  });
});

describe("parseMetrics", () => {
  it("识别名称 + 数字 + 单位", () => {
    const [metric] = parseMetrics("体重 70.5kg", [WEIGHT]);

    expect(metric).toEqual({
      metricId: "m-weight",
      name: "体重",
      value: 70.5,
      unit: "kg",
      raw: "体重 70.5kg",
      start: 0,
      end: 9,
    });
  });

  it("数字与单位之间允许空格", () => {
    expect(parseMetrics("体重 70.5 kg", [WEIGHT])[0]?.raw).toBe("体重 70.5 kg");
  });

  it("允许冒号与省略单位", () => {
    expect(parseMetrics("体重：70.5", [WEIGHT])[0]).toMatchObject({
      value: 70.5,
      unit: "kg",
    });
    expect(parseMetrics("体重:70.5", [WEIGHT])[0]?.value).toBe(70.5);
    expect(parseMetrics("体重70.5", [WEIGHT])[0]?.value).toBe(70.5);
  });

  it("单位与定义不一致时整段不识别", () => {
    expect(parseMetrics("体重 70.5斤", [WEIGHT])).toEqual([]);
  });

  it("支持负数与整数", () => {
    expect(parseMetrics("体重 -2kg", [WEIGHT])[0]?.value).toBe(-2);
    expect(parseMetrics("花费 30元", [SPEND])[0]?.value).toBe(30);
  });

  it("不会从更长的词中间截出指标名", () => {
    expect(parseMetrics("总体重 70.5kg", [WEIGHT])).toEqual([]);
    expect(parseMetrics("称体重 70.5kg", [WEIGHT])).toEqual([]);
  });

  it("英文指标名不区分大小写，返回定义里的原名", () => {
    const definition: MetricDefinition = { id: "m-w", name: "Weight", unit: "kg" };
    expect(parseMetrics("weight 70kg", [definition])[0]).toMatchObject({
      metricId: "m-w",
      name: "Weight",
      value: 70,
    });
  });

  it("同一指标出现多次只保留最后一次", () => {
    const metrics = parseMetrics("体重 70kg，体重 71kg", [WEIGHT]);
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({ value: 71, start: 8 });
  });

  it("多个指标按出现顺序返回", () => {
    const metrics = parseMetrics("花费 30元 然后 体重 70kg", [WEIGHT, SPEND]);
    expect(metrics.map((metric) => metric.metricId)).toEqual(["m-spend", "m-weight"]);
  });

  it("同名多定义按单位择一命中", () => {
    const kg = { id: "m-kg", name: "体重", unit: "kg" };
    const jin = { id: "m-jin", name: "体重", unit: "斤" };

    expect(parseMetrics("体重 70斤", [kg, jin])[0]?.metricId).toBe("m-jin");
    expect(parseMetrics("体重 70kg", [jin, kg])[0]?.metricId).toBe("m-kg");
    expect(parseMetrics("体重 70斤", [kg])).toEqual([]);
  });

  it("NFKC 归一化全角数字并映射回原文位置", () => {
    const content = "体重 ７０kg";
    const [metric] = parseMetrics(content, [WEIGHT]);

    expect(metric?.value).toBe(70);
    expect(content.slice(metric?.start, metric?.end)).toBe(content);
  });

  it("兼容全角空格", () => {
    const content = "体重\u300070kg";
    const [metric] = parseMetrics(content, [WEIGHT]);
    expect(metric?.value).toBe(70);
    expect(metric?.raw).toBe(content);
  });

  it("没有定义时返回空数组", () => {
    expect(parseMetrics("体重 70kg", [])).toEqual([]);
    expect(parseMetrics("体重 70kg", [{ id: "x", name: "", unit: "kg" }])).toEqual([]);
  });

  it("单位为空白的定义不参与单位候选", () => {
    const definition: MetricDefinition = { id: "m-check", name: "打卡", unit: "" };
    expect(parseMetrics("打卡 3", [definition])[0]).toMatchObject({ value: 3, unit: "" });
    expect(parseMetrics("打卡 3次", [definition])).toEqual([]);
  });
});

describe("suggestMetrics", () => {
  it("提示未被定义的数字 + 白名单单位", () => {
    const [suggestion] = suggestMetrics("今天 步数 8000步", []);

    expect(suggestion).toEqual({
      name: "步数",
      unit: "步",
      value: 8000,
      raw: "步数 8000步",
      start: 3,
      end: 11,
    });
  });

  it("指标名必须位于行首、空白或标点之后", () => {
    expect(suggestMetrics("（步数 8000步）", [])[0]).toMatchObject({ name: "步数", value: 8000 });
  });

  it("已存在的指标名不再提示", () => {
    expect(suggestMetrics("体重 70kg", [WEIGHT])).toEqual([]);
  });

  it("单位不在白名单时不提示", () => {
    expect(suggestMetrics("血氧 98%", [])).toEqual([]);
    expect(suggestMetrics("气温 26度", [])).toEqual([]);
  });

  it("跳过已被指标占用的区间", () => {
    expect(suggestMetrics("步数 8000步", [], [{ start: 0, end: 8 }])).toEqual([]);
    expect(suggestMetrics("步数 8000步", [], [{ start: 8, end: 9 }])).toHaveLength(1);
  });

  it("同一名称与单位只提示一次", () => {
    const suggestions = suggestMetrics("步数 8000步，步数 9000步", []);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.value).toBe(8000);
  });

  it("最多提示固定条数", () => {
    const content = "步数 1步 喝水 2杯 页数 3页 拍照 4张 睡眠 5小时";
    expect(suggestMetrics(content, [])).toHaveLength(MAX_METRIC_SUGGESTIONS);
  });

  it("支持冒号写法", () => {
    expect(suggestMetrics("睡眠：7小时", [])[0]).toMatchObject({
      name: "睡眠",
      value: 7,
      unit: "小时",
    });
  });
});

describe("suggestionKey / filterIgnoredSuggestions", () => {
  it("键忽略大小写与全角差异", () => {
    expect(suggestionKey("Weight", "KG")).toBe(suggestionKey("weight", "ｋｇ"));
  });

  it("按名称 + 单位过滤已忽略的建议", () => {
    const suggestions = suggestMetrics("步数 8000步 睡眠 7小时", []);
    const filtered = filterIgnoredSuggestions(suggestions, [{ name: "步数", unit: "步" }]);

    expect(filtered.map((item) => item.name)).toEqual(["睡眠"]);
  });
});
