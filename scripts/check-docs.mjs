#!/usr/bin/env node
/**
 * 文档校验脚本（零依赖）
 *
 * 默认校验（快、可离线）：
 *  1. 有且仅有一个 H1，标题不跳级
 *  2. Markdown 代码块闭合
 *  3. 相对链接指向的文件存在
 *
 * 可选：--links 额外检查外部 http(s) 链接是否可访问。
 * 网络抖动导致的失败只记为 warning，不会让校验失败；4xx/5xx 才算错误。
 *
 * 用法：
 *   node scripts/check-docs.mjs
 *   node scripts/check-docs.mjs --links
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_DIR = join(ROOT, "docs");
const CHECK_LINKS = process.argv.includes("--links");
const CONCURRENCY = 2;
const TIMEOUT_MS = 15000;

const errors = [];
const warnings = [];

const rel = (p) => p.replace(ROOT + "\\", "").replace(ROOT + "/", "");

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      out.push(...(await walk(full)));
    } else if (extname(e.name).toLowerCase() === ".md") {
      out.push(full);
    }
  }
  return out;
}

/** 去掉围栏代码块和行内代码，避免把示例里的链接当成真链接 */
function stripCode(md) {
  return md.replace(/^```[\s\S]*?^```/gm, "").replace(/`[^`\n]*`/g, "");
}

function checkStructure(file, md) {
  const name = rel(file);
  const lines = md.split(/\r?\n/);
  const fences = lines.filter((l) => /^\s{0,3}```/.test(l)).length;
  if (fences % 2 !== 0) {
    errors.push(`${name}: 代码块围栏数量为奇数（${fences}），存在未闭合的 \`\`\``);
  }

  let h1 = 0;
  let prev = 0;
  let inFence = false;
  lines.forEach((line, i) => {
    if (/^\s{0,3}```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const m = /^(#{1,6})\s+\S/.exec(line);
    if (!m) return;
    const level = m[1].length;
    if (level === 1) h1 += 1;
    if (level > prev + 1 && prev > 0) {
      warnings.push(`${name}:${i + 1} 标题从 H${prev} 跳到 H${level}`);
    }
    prev = level;
  });

  if (h1 !== 1) {
    errors.push(`${name}: 期望有且仅有 1 个 H1，实际 ${h1} 个`);
  }
}

function linkTargets(md) {
  const text = stripCode(md);
  const targets = [];
  const re = /!?\[[^\]]*\]\(\s*<?([^)>\s]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;
  let m;
  while ((m = re.exec(text))) {
    const url = m[1];
    if (!url || url.startsWith("#")) continue;
    targets.push(url);
  }
  return [...new Set(targets)];
}

const isExternal = (url) => /^https?:\/\//i.test(url);

async function checkRelative(file, url) {
  const clean = decodeURI(url.split("#")[0].split("?")[0]);
  if (!clean) return null;
  try {
    await stat(resolve(dirname(file), clean));
    return null;
  } catch {
    return `${rel(file)}: 相对链接不存在 -> ${url}`;
  }
}

async function fetchStatus(url) {
  const opts = {
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "User-Agent": "docs-link-checker" },
  };
  let res = await fetch(url, { ...opts, method: "HEAD" });
  if (res.status === 405 || res.status === 501) {
    res = await fetch(url, { ...opts, method: "GET" });
  }
  return res.status;
}

async function checkExternal(url) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const status = await fetchStatus(url);
      if (status === 429 || status === 403) {
        warnings.push(`外链跳过 (HTTP ${status}，可能限流) -> ${url}`);
        return null;
      }
      if (status >= 400) {
        return `外链不可访问 (HTTP ${status}) -> ${url}`;
      }
      return null;
    } catch (e) {
      if (attempt === 2) {
        const code = e.cause?.code || e.name;
        warnings.push(`外链网络不可达 (${code})，已跳过 -> ${url}`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return null;
}

async function runPool(tasks, limit) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (i < tasks.length) {
      const index = i++;
      await tasks[index]();
    }
  });
  await Promise.all(workers);
}

async function main() {
  const files = await walk(DOCS_DIR);
  if (files.length === 0) {
    console.log("docs/ 下没有 Markdown 文件，跳过。");
    return;
  }

  const externalUrls = [];

  for (const file of files) {
    const md = await readFile(file, "utf8");
    checkStructure(file, md);
    for (const url of linkTargets(md)) {
      if (isExternal(url)) externalUrls.push(url);
      else {
        const issue = await checkRelative(file, url);
        if (issue) errors.push(issue);
      }
    }
  }

  if (CHECK_LINKS) {
    const unique = [...new Set(externalUrls)];
    console.log(`检查 ${unique.length} 个外部链接（这会慢一些）…`);
    let done = 0;
    await runPool(
      unique.map((url) => async () => {
        const issue = await checkExternal(url);
        if (issue) errors.push(issue);
        done += 1;
        if (done % 10 === 0) console.log(`  已检查 ${done}/${unique.length}`);
      }),
      CONCURRENCY
    );
  }

  console.log(`已检查 ${files.length} 个文档，${externalUrls.length} 个外链引用。`);
  for (const w of warnings) console.log(`[warn] ${w}`);

  if (errors.length > 0) {
    console.error(`\n发现 ${errors.length} 个问题：`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }

  console.log("✓ 文档校验通过");
}

await main();
