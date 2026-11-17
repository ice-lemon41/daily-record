import {
  MAX_METRIC_SUGGESTIONS,
  SUGGESTION_NAME_MAX,
  SUGGESTION_NAME_MIN,
  UNIT_WHITELIST,
} from "./constants";

export interface MetricDefinition {
  id: string;
  name: string;
  unit: string;
}

export interface ParsedMetric {
  metricId: string;
  /** 命中时使用的名称，写入 entryMetrics.nameSnapshot。 */
  name: string;
  value: number;
  unit: string;
  /** 正文中的原始片段。 */
  raw: string;
  start: number;
  end: number;
}

export interface MetricSuggestion {
  name: string;
  unit: string;
  value: number;
  raw: string;
  start: number;
  end: number;
}

export interface IgnoredSuggestionLike {
  name: string;
  unit: string;
}

const NUMBER = "-?\\d+(?:\\.\\d+)?";

/** 行首、空白或标点之后，避免从词中间截出指标名。 */
const NAME_BOUNDARY = String.raw`(?<=^|[\s，。！？、；：,.!?;:（(【\[「『"'])`;

const SUGGESTION_NAME = String.raw`[\p{Script=Han}a-zA-Z]{${SUGGESTION_NAME_MIN},${SUGGESTION_NAME_MAX}}`;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeUnit(unit: string): string {
  return unit.normalize("NFKC").toLowerCase();
}

/**
 * NFKC 可能把一个字符变成多个（如 ㍿ → 株式会社），
 * 所以同时保留「归一化后的位置 → 原文位置」的映射。
 */
function normalizeWithMap(input: string): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];

  for (let i = 0; i < input.length; i += 1) {
    const normalized = input.charAt(i).normalize("NFKC");
    text += normalized;
    for (let k = 0; k < normalized.length; k += 1) {
      map.push(i);
    }
  }
  map.push(input.length);

  return { text, map };
}

/** 归一化后的位置 → 原文位置；调用方保证 index 在映射范围内。 */
function originalStart(map: number[], index: number): number {
  return map[index] as number;
}

function originalEnd(map: number[], index: number): number {
  return (map[index - 1] as number) + 1;
}

/** 候选单位：白名单 + 所有指标定义里出现过的单位，按长度倒序。 */
function unitAlternation(definitions: MetricDefinition[]): string {
  const seen = new Map<string, string>();
  for (const unit of [...UNIT_WHITELIST, ...definitions.map((d) => d.unit)]) {
    const normalized = unit.normalize("NFKC");
    if (normalized) seen.set(normalized.toLowerCase(), normalized);
  }
  return [...seen.values()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
}

/**
 * 解析正文中的「指标名 + 数字 + 可选单位」。
 * 单位与定义不一致时整段不识别（PRD FR-04-3）。
 */
export function parseMetrics(content: string, definitions: MetricDefinition[]): ParsedMetric[] {
  const defs = definitions
    .map((definition) => ({
      ...definition,
      nameNorm: definition.name.normalize("NFKC"),
      unitNorm: normalizeUnit(definition.unit),
    }))
    .filter((definition) => definition.nameNorm.length > 0);

  if (defs.length === 0) return [];

  const { text, map } = normalizeWithMap(content);

  const byName = new Map<string, (typeof defs)[number][]>();
  for (const definition of defs) {
    const key = definition.nameNorm.toLowerCase();
    const list = byName.get(key) ?? [];
    list.push(definition);
    byName.set(key, list);
  }

  const names = [...byName.keys()].sort((a, b) => b.length - a.length);
  const metricPattern = new RegExp(
    String.raw`(?<![\p{L}\p{N}_])(${names.map(escapeRegExp).join("|")})\s{0,3}(?:[:：]\s{0,3})?(${NUMBER})`,
    "giu",
  );

  const units = unitAlternation(definitions);
  const unitPattern = new RegExp(String.raw`^\s{0,3}(${units})(?![\p{L}\p{N}])`, "iu");

  const accepted: ParsedMetric[] = [];

  for (const match of text.matchAll(metricPattern)) {
    // 正则由上面的指标名构造，命中项一定能在 byName 里找到。
    const candidates = byName.get((match[1] as string).toLowerCase()) as (typeof defs)[number][];

    const value = Number(match[2] as string);
    const matchStart = match.index as number;
    const numberEnd = matchStart + match[0].length;

    let matchEnd = numberEnd;
    const unitMatch = unitPattern.exec(text.slice(numberEnd));

    // 同名多定义（改名/改单位后的历史别名）：优先选单位一致的那条
    let definition: (typeof defs)[number] | undefined;
    if (unitMatch) {
      const unitNorm = normalizeUnit(unitMatch[1] as string);
      definition = candidates.find((candidate) => candidate.unitNorm === unitNorm);
      if (!definition) continue; // 单位不一致 → 整段不识别
      matchEnd = numberEnd + unitMatch[0].length;
    } else {
      definition = candidates[0] as (typeof defs)[number];
    }

    const start = originalStart(map, matchStart);
    const end = originalEnd(map, matchEnd);

    accepted.push({
      metricId: definition.id,
      name: definition.name,
      value,
      unit: definition.unit,
      raw: content.slice(start, end),
      start,
      end,
    });
  }

  // 同一指标出现多次只保留最后一次（PRD FR-04-4）
  const lastByMetric = new Map<string, ParsedMetric>();
  for (const parsed of accepted) lastByMetric.set(parsed.metricId, parsed);

  return [...lastByMetric.values()].sort((a, b) => a.start - b.start);
}

/**
 * 在「没有被已有指标占用」的片段里寻找新指标候选。
 * 只提示、不自动建档；同一 name + unit 只保留第一次。
 */
export function suggestMetrics(
  content: string,
  definitions: MetricDefinition[],
  takenRanges: ReadonlyArray<{ start: number; end: number }> = [],
): MetricSuggestion[] {
  const units = unitAlternation([]);

  const { text, map } = normalizeWithMap(content);
  const existingNames = new Set(
    definitions.map((definition) => definition.name.normalize("NFKC").toLowerCase()),
  );

  const pattern = new RegExp(
    String.raw`${NAME_BOUNDARY}(${SUGGESTION_NAME})\s{0,3}(?:[:：]\s{0,3})?(${NUMBER})\s{0,3}(${units})(?![\p{L}\p{N}])`,
    "gmu",
  );

  const suggestions: MetricSuggestion[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(pattern)) {
    if (suggestions.length >= MAX_METRIC_SUGGESTIONS) break;

    const name = match[1] as string;
    const unit = match[3] as string;
    const nameKey = name.normalize("NFKC").toLowerCase();
    if (existingNames.has(nameKey)) continue;

    const matchStart = match.index as number;
    const end = matchStart + match[0].length;
    const start = originalStart(map, matchStart);
    const originalMatchEnd = originalEnd(map, end);

    const overlaps = takenRanges.some(
      (range) => start < range.end && originalMatchEnd > range.start,
    );
    if (overlaps) continue;

    const key = `${nameKey}|${normalizeUnit(unit)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    suggestions.push({
      name,
      unit,
      value: Number(match[2] as string),
      raw: content.slice(start, originalMatchEnd),
      start,
      end: originalMatchEnd,
    });
  }

  return suggestions;
}

export function suggestionKey(name: string, unit: string): string {
  return `${name.normalize("NFKC").toLowerCase()}|${normalizeUnit(unit)}`;
}

export function filterIgnoredSuggestions(
  suggestions: MetricSuggestion[],
  ignored: IgnoredSuggestionLike[],
): MetricSuggestion[] {
  const ignoredKeys = new Set(ignored.map((item) => suggestionKey(item.name, item.unit)));
  return suggestions.filter((item) => !ignoredKeys.has(suggestionKey(item.name, item.unit)));
}
