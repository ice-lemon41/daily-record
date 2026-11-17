import { describe, expect, it } from "vitest";
import { MAX_TAG_LENGTH } from "./constants";
import { parseTags } from "./parse-tags";

function names(content: string): string[] {
  return parseTags(content).map((tag) => tag.name);
}

describe("parseTags", () => {
  it("解析行首与空白后的标签", () => {
    expect(names("#健康 今天很好")).toEqual(["健康"]);
    expect(names("今天 #健康 很好")).toEqual(["健康"]);
  });

  it("返回正文中的精确位置", () => {
    const content = "今天 #健康 很好";
    const [tag] = parseTags(content);

    expect(tag).toMatchObject({ name: "健康", nameLower: "健康", start: 4, end: 6 });
    expect(content.slice(tag?.start, tag?.end)).toBe("健康");
  });

  it("行首标签从 # 之后开始", () => {
    const [tag] = parseTags("#健康");
    expect(tag).toMatchObject({ start: 1, end: 3 });
  });

  it("不误伤 URL 片段", () => {
    expect(names("见 https://example.com/#/path")).toEqual([]);
    expect(names("中文#标签")).toEqual([]);
  });

  it("末尾中英文标点不计入标签名", () => {
    expect(names("#健康，今天")).toEqual(["健康"]);
    expect(names("#健康，#运动。")).toEqual(["健康", "运动"]);
    expect(names("#健康。")).toEqual(["健康"]);
    expect(names("#work!")).toEqual(["work"]);
    expect(names("（#健康）")).toEqual(["健康"]);
    expect(names("#健康, 还行")).toEqual(["健康"]);
  });

  it("只有标点的标签会被丢弃", () => {
    expect(names("#，")).toEqual([]);
    expect(names("#")).toEqual([]);
    expect(names("##双层")).toEqual([]);
  });

  it("英文标签保留原文并额外给出小写形式", () => {
    const [tag] = parseTags("#Health 打卡");
    expect(tag).toMatchObject({ name: "Health", nameLower: "health" });
  });

  it("支持多个标签", () => {
    expect(names("#健康 #work #健康")).toEqual(["健康", "work", "健康"]);
    expect(names("换行\n#旅行\n#美食")).toEqual(["旅行", "美食"]);
  });

  it("超过长度上限的标签整段不解析", () => {
    const atLimit = "a".repeat(MAX_TAG_LENGTH);
    const tooLong = "a".repeat(MAX_TAG_LENGTH + 1);

    expect(names(`#${atLimit}`)).toEqual([atLimit]);
    expect(names(`#${tooLong}`)).toEqual([]);
  });

  it("支持全角空格与括号作为边界", () => {
    expect(names("今天\u3000#健康")).toEqual(["健康"]);
    expect(names("【#健康】")).toEqual(["健康"]);
  });
});
