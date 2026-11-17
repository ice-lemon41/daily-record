import { describe, expect, it } from "vitest";
import { splitHighlight } from "./highlight";

describe("splitHighlight", () => {
  it("切出单个命中并保留前后文本", () => {
    expect(splitHighlight("今天开会超时", "开会")).toEqual([
      { text: "今天", match: false },
      { text: "开会", match: true },
      { text: "超时", match: false },
    ]);
  });

  it("不区分大小写，保留原文大小写", () => {
    expect(splitHighlight("Meeting 记录", "meet")).toEqual([
      { text: "Meet", match: true },
      { text: "ing 记录", match: false },
    ]);
  });

  it("支持多个命中", () => {
    expect(splitHighlight("开会又开会", "开会")).toEqual([
      { text: "开会", match: true },
      { text: "又", match: false },
      { text: "开会", match: true },
    ]);
  });

  it("没有命中时整段返回", () => {
    expect(splitHighlight("今天很好", "开会")).toEqual([{ text: "今天很好", match: false }]);
  });

  it("空关键词整段返回，空文本返回空数组", () => {
    expect(splitHighlight("今天很好", "  ")).toEqual([{ text: "今天很好", match: false }]);
    expect(splitHighlight("", "开会")).toEqual([]);
  });
});
