export interface HighlightPart {
  text: string;
  match: boolean;
}

/**
 * 把文本按关键词切成普通片段与高亮片段（PRD FR-07-2）。
 * 匹配不区分大小写，保留原文大小写；空关键词返回整段普通文本。
 */
export function splitHighlight(text: string, keyword: string): HighlightPart[] {
  const needle = keyword.trim();
  if (needle.length === 0) {
    return text.length > 0 ? [{ text, match: false }] : [];
  }

  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const parts: HighlightPart[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const found = lowerText.indexOf(lowerNeedle, cursor);
    if (found === -1) {
      parts.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (found > cursor) {
      parts.push({ text: text.slice(cursor, found), match: false });
    }
    parts.push({ text: text.slice(found, found + needle.length), match: true });
    cursor = found + needle.length;
  }

  return parts;
}
