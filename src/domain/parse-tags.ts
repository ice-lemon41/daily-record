import { MAX_TAG_LENGTH } from "./constants";

export interface ParsedTag {
  /** 原样保留大小写与中文。 */
  name: string;
  /** 用于存储与去重：英文统一小写。 */
  nameLower: string;
  start: number;
  end: number;
}

/**
 * 行首、空白或标点之后的 #。前面的字符会被一并吃掉，
 * 所以 /#/path 这类 URL 片段不会命中。
 */
const TAG_PATTERN =
  /(?:^|[\s，。！？、；：,.!?;:（(【[「『"'])#([^\s#，。！？、；：,.!?;:（）()【】[\]「」『』"'“”’]+)/gmu;

export function parseTags(content: string): ParsedTag[] {
  const tags: ParsedTag[] = [];

  for (const match of content.matchAll(TAG_PATTERN)) {
    const name = match[1] as string;
    // 超过 20 字符整段不解析，绝不截断
    if ([...name].length > MAX_TAG_LENGTH) continue;

    const start = (match.index as number) + match[0].length - name.length;
    tags.push({
      name,
      nameLower: name.toLowerCase(),
      start,
      end: start + name.length,
    });
  }

  return tags;
}
