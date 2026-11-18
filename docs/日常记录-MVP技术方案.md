# 日常记录 MVP · 技术方案

> 版本：v0.1
> 日期：2026-11-17
> 对应 PRD：[`docs/PRD.md`](./PRD.md) v0.1
> 状态：待评审，评审通过后进入 M0
> 形态：Android Chrome 上的可安装 PWA，纯静态、无后端

---

## 0. 一页结论

### 0.1 选型表

| 层 | 选择 | 版本（2026-11 npm latest） | 定稿理由 |
|---|---|---|---|
| 语言 | TypeScript（strict） | 7.0.2 | 数据契约和解析器需要类型约束；构建期 `tsc --noEmit` |
| 构建 | Vite | 8.3.8 | 纯静态产物、秒级 HMR、一等公民 PWA 插件 |
| React 插件 | @vitejs/plugin-react | 6.3.0 | 与 Vite 8 配套 |
| UI | React | 19.3.1 | 生态与测试工具成熟，单人维护成本低 |
| 样式 | Tailwind CSS | 4.3.5 | 构建期生成、运行时零体积，四个界面够用 |
| 样式插件 | @tailwindcss/vite | 4.3.5 | Tailwind 4 的 Vite 集成 |
| 存储 | IndexedDB + Dexie | 4.4.7 | 多表事务、索引、无特殊响应头要求，适配 GitHub Pages |
| 数据订阅 | dexie-react-hooks | 4.4.0 | `useLiveQuery` 直接替代全局状态库 |
| 导入校验 | Zod | 4.6.7 | 只用于导入，动态加载，不进首屏 |
| PWA | vite-plugin-pwa（Workbox） | 2.0.0 | 预缓存 + 更新提示，配置量最小 |
| 单元测试 | Vitest + Testing Library | 5.1.0 / 16.3.3 | 与 Vite 共用配置；组件测试成熟 |
| 数据层测试 | fake-indexeddb | 6.2.8 | 在 Node 中跑真实 IndexedDB 语义 |
| E2E | Playwright | 1.65.1 | 离线、下载、移动视口都能测 |
| 规范 | Biome | 2.6.8 | lint + format 一个工具，比 ESLint + Prettier 快 |
| 部署 | GitHub Pages + Actions | — | 已有 GitHub 工作流，免费 HTTPS，满足 PWA 安装条件 |
| 运行时 | Node.js 24 LTS | 24.x | 与 CI 对齐；Vitest 5 要求 ≥ 22.12 |

### 0.2 五个关键判断

1. **不做路由**。四个界面里只有设置页是独立页，其余用「主界面 + 弹层」表达，避免引入 Router、避免 GitHub Pages 的 SPA 404 问题。
2. **不做全局状态库**。IndexedDB 是唯一真相，写操作走仓储函数，读操作走 `useLiveQuery`；筛选、弹层状态用组件内 `useState`。
3. **不引入日期库**。只处理本地时区的展示与分组，原生 `Date` + `Intl.DateTimeFormat` 足够，省 20KB 且避免时区库的行为差异；日期纯函数全部单测。
4. **不引入 Markdown/富文本库**。PRD 明确 P0 不渲染 Markdown，正文按纯文本存储与展示，只在导出时原样输出。
5. **重活懒加载**。Zod 校验、导出/导入、设置页从首屏 bundle 里拆出去，保证冷启动预算。

### 0.3 首屏体积预算

| 项 | 预算（gzip） | 说明 |
|---|---|---|
| React + ReactDOM | ~50 KB | production 构建 |
| Dexie | ~25 KB | 含 `useLiveQuery` |
| 业务代码 | ~25 KB | 解析器、仓储、四个界面 |
| CSS | ~15 KB | Tailwind 仅保留使用的类 |
| **合计** | **≤ 120 KB** | 不含图标；中端 Android 4G 下 < 1s 下载 |

> 预算在 M1 结束时用 `vite build` 实测一次，M5 再验一次；超标优先拆设置页与导入逻辑。

---

## 1. 约束推导

PRD 的硬约束直接决定了技术方案，逐条对应如下：

| PRD 约束 | 技术含义 | 方案落点 |
|---|---|---|
| 纯本地、无账号、无同步（§2.2） | 没有 API、没有服务端、没有鉴权 | 静态站点 + IndexedDB |
| 导出/导入是核心功能（§7 FR-10） | 数据层必须能完整序列化与重建 | 导出走纯函数；导入单 Dexie 事务 |
| 断网可用、可安装（§7 FR-11） | Service Worker 预缓存全部外壳 | `vite-plugin-pwa` 的 `generateSW` |
| 冷启动 ≤ 2s（§9） | 控制首屏 JS、避免读大表 | 分页游标 + 元数据查询 + 懒加载 |
| 1 万条不卡（§9） | 索引与分页策略要对 | 复合索引、每页 50、避免全表渲染 |
| 写入必须事务提交后才反馈（§7 FR-01） | 存储 API 必须支持事务 | Dexie `transaction('rw', ...)` |
| 派生数据保存时整条重建（§8.2） | 多表写入要么全成要么全败 | 单事务内先删后插 |
| 不接第三方脚本（§9） | 无 CDN、无统计、无外部字体 | 系统字体栈 + 本地打包 |
| 只跑 Android Chrome/Edge（§9） | 不考虑 Safari 的存储怪癖 | IndexedDB 标准 API 即可 |
| 部署到 GitHub Pages | 不能自定义响应头 | 排除依赖 COOP/COEP 的方案（见 §12） |

**GitHub Pages 的两个硬限制**（会影响实现，提前写死）：

1. 项目站点路径是 `https://<user>.github.io/<repo>/`，Vite 的 `base`、PWA 的 `scope`/`start_url` 必须跟着变；
2. 免费账号的 Pages 要求仓库公开；私有仓库需要 GitHub Pro。仓库已定为**公开**的 `daily-record`（ASCII 名称），避免中文仓库名被 URL 编码导致 PWA 作用域出错（见 §13.1 D2）。

---

## 2. 整体架构

### 2.1 分层

```
┌──────────────────────────────────────────┐
│ UI  src/features/*  src/components/*     │  React 组件、弹层、交互
│     只做展示与事件，不直接拼 SQL/查询      │
└──────────────────┬───────────────────────┘
                   │ hooks（useLiveQuery / 自定义 hook）
┌──────────────────▼───────────────────────┐
│ 仓储 src/db/repositories/*                │  事务边界、软删除过滤、分页
└──────────────────┬───────────────────────┘
                   │ 纯数据
┌──────────────────▼───────────────────────┐
│ 领域 src/domain/*                         │  解析、分组、导出/导入（无 IO）
│     不 import React，不 import Dexie       │  100% 可单测
└──────────────────────────────────────────┘
```

**依赖规则**（用 Biome 的 `noRestrictedImports` 兜底）：

- `src/domain/**` 不得 import `react`、`dexie`、`src/db/**`；
- `src/db/**` 不得 import `react`、`src/features/**`；
- `src/features/**` 不得直接 `db.entries.where(...)`，必须经仓储函数。

这条规则让「解析器 / 导出 / 分组」可以在 Node 里毫秒级测试，也让未来换存储（比如 P1 的 SQLite）时只改 `src/db`。

### 2.2 目录结构

```
daily-record/
├── docs/                       # PRD、调研、本方案
├── scripts/
│   ├── check-docs.mjs          # 文档校验
│   ├── check-icons.mjs         # 图标尺寸/格式校验（进 npm test）
│   └── generate-icons.mjs      # 由 favicon 图形生成 192/512/maskable PNG
├── public/
│   ├── icons/                  # 192/512/maskable PNG
│   └── favicon.svg
├── src/
│   ├── main.tsx                # createRoot
│   ├── App.tsx                 # 主界面骨架（无路由）
│   ├── features/
│   │   ├── composer/           # 输入框、时间归属、解析预览、提交
│   │   ├── timeline/           # 分组列表、分页、条目菜单、撤销
│   │   ├── editor/             # 编辑面板
│   │   ├── calendar/           # 月视图、打点、按天筛选（M3）
│   │   ├── search/             # 搜索框、高亮、筛选 chip（M3）
│   │   └── settings/           # 导出/导入、指标管理、备份提醒（M4）
│   ├── components/             # Toast、Modal 等无业务组件
│   ├── db/
│   │   ├── db.ts               # Dexie 实例与版本声明
│   │   ├── schema.ts           # 行类型
│   │   ├── bench/              # 10k 搜索基准（不进默认测试）
│   │   └── repositories/
│   │       ├── entries.ts      # 增删改查、分页、筛选、搜索
│   │       ├── metrics.ts
│   │       ├── tags.ts
│   │       └── kv.ts           # 草稿、lastExportAt、schemaVersion
│   ├── domain/
│   │   ├── parse-tags.ts
│   │   ├── parse-metrics.ts
│   │   ├── dates.ts
│   │   ├── export-json.ts
│   │   ├── export-markdown.ts
│   │   ├── import-json.ts      # 纯校验与转换，不碰 DB
│   │   └── constants.ts        # 单位白名单、限制值
│   ├── hooks/
│   │   ├── use-draft.ts
│   │   └── use-now.ts
│   ├── pwa/                    # SW 注册、新版本提示条（M5）
│   │   ├── use-pwa-update.ts
│   │   └── PwaUpdateBanner.tsx
│   ├── styles/index.css        # Tailwind 入口 + 设计变量
│   └── test/
│       ├── setup.ts            # fake-indexeddb、时区、RTL 清理
│       └── db.ts               # 独立测试库工厂与清理
├── tests/e2e/                  # Playwright
├── index.html
├── vite.config.ts
├── vitest.config.ts
├── vitest.bench.config.ts
├── playwright.config.ts
├── tsconfig.json
├── biome.json
├── package.json
└── .github/workflows/{ci,deploy}.yml
```

> 说明：应用代码直接放仓库根目录，不建 `app/` 子包。仓库只有一个 `package.json`，`npm test` 同时跑文档校验和应用测试，符合 `agent.md` 的「一次改动、一次通过、一次提交」。

### 2.3 写入与读取路径

**写入（新建一条记录）**：

```
Composer 提交
  → 去空校验
  → 生成 id / 三个时间戳
  → domain.parseTags + parseMetrics（纯计算，事务外完成）
  → db.transaction('rw', entries, tags, entryTags, metrics?, entryMetrics, kv)
       ├─ entries.add
       ├─ tags 去重 upsert
       ├─ entryTags.bulkAdd
       ├─ entryMetrics.bulkAdd
       └─ kv.delete('draft')
  → 成功：清空输入框、时间重置、Toast（若触发指标建议）
  → 失败：保留正文，提示「保存失败，请重试」
```

**关键点**：所有解析在事务开始前完成。Dexie 的事务在 `await` 到非 Dexie Promise 时会提前提交，事务内只允许 Dexie 操作。

**读取（时间线）**：

```
useLiveQuery(() => listEntries({ filter, cursor, limit: 50 }))
  → 先用复合索引取 50 条 entries
  → 批量取这些 id 的 entryMetrics（一次 anyOf）
  → 组装成 view model
```

---

## 3. 数据层

### 3.1 表与索引

```ts
// src/db/schema.ts
export interface EntryRow {
  id: string;
  content: string;
  occurredAt: number;   // UTC ms
  createdAt: number;
  updatedAt: number;
  pinned: 0 | 1;        // IndexedDB 不索引 boolean
  deletedAt: number;    // 0 = 未删除；IndexedDB 不索引 null
  extra: { ignoredSuggestions: IgnoredSuggestion[] };
}

export interface TagRow { id: string; name: string }          // 英文已小写
export interface EntryTagRow {
  entryId: string;
  tagId: string;
  occurredAt: number;   // 冗余列，仅供标签筛选按时间分页
}
export interface MetricRow {
  id: string;
  name: string;
  nameLower: string;    // 唯一索引，实现「不区分大小写不可重复」
  unit: string;
  archived: 0 | 1;
  createdAt: number;
}
export interface EntryMetricRow {
  id: string;
  entryId: string;
  metricId: string;
  nameSnapshot: string; // 写入时名称快照，仅内部使用，不导出
  value: number;
  unit: string;         // 写入时单位快照
  raw: string;
}
export interface KvRow { key: string; value: unknown }
```

```ts
// src/db/db.ts
import Dexie, { type EntityTable, type Table } from 'dexie';

export type AppDb = Dexie & {
  entries: EntityTable<EntryRow, 'id'>;
  tags: EntityTable<TagRow, 'id'>;
  entryTags: Table<EntryTagRow, [string, string]>;
  metrics: EntityTable<MetricRow, 'id'>;
  entryMetrics: EntityTable<EntryMetricRow, 'id'>;
  kv: EntityTable<KvRow, 'key'>;
};

export function createDb(name = 'daily-record') {
  const db = new Dexie(name) as AppDb;
  db.version(1).stores({
    entries: 'id, occurredAt, createdAt, pinned, deletedAt, [deletedAt+occurredAt], [deletedAt+pinned+occurredAt+createdAt+id]',
    tags: 'id, &name',
    entryTags: '[entryId+tagId], entryId, tagId, [tagId+occurredAt+entryId]',
    metrics: 'id, &nameLower, archived',
    entryMetrics: 'id, &[entryId+metricId], entryId, metricId',
    kv: 'key',
  });
  return db;
}

export const db = createDb();
```

### 3.2 设计说明

| 决策 | 原因 |
|---|---|
| `deletedAt` 用 `0` 表示未删除 | IndexedDB 不索引 `null`，用 `0` 才能命中复合索引 |
| `pinned` 存 `0/1` | 同上；展示层再转 boolean |
| ID 用 `crypto.randomUUID()` | PRD §8.2 要求 UUID 永不复用；安全上下文（HTTPS/localhost）下可用 |
| 时间全存 UTC 毫秒 | PRD §8.2；只在展示/分组时转本地 |
| `extra` 存对象而非字符串 | Dexie 走结构化克隆，读写都免序列化；内容始终是纯 JSON 值 |
| `entryMetrics` 复合唯一索引 | 同一指标重复出现时解析阶段已去重，数据库再做兜底 |
| `nameSnapshot` / `unit` 快照 | 指标改名或改单位后，旧条目在重建时仍能按「写入时的定义」命中（PRD FR-09-3/4） |
| `entryTags.occurredAt` 冗余 | 标签筛选要按时间分页；把排序键冗余到交叉表，避免先取全量 id 再排序 |
| `metrics.nameLower` 单独一列 | 用唯一索引实现「不区分大小写去重」，比全表扫描可靠；唯一性**包含已归档**指标，避免归档名称被重复占用 |
| 不建 `deleted` 布尔列 | 与 PRD 的 `deleted_at` 语义一致，避免两份真相 |

### 3.3 事务边界

| 操作 | 事务范围 | 失败行为 |
|---|---|---|
| 新建记录 | `entries, tags, entryTags, entryMetrics, kv` | 全部回滚，输入框内容保留 |
| 编辑记录 | 同上（先删派生，再重建） | 全部回滚，编辑面板不关闭 |
| 删除 / 撤销 | `entries` | 单行更新 |
| 导入 | 全部 6 张表 | 全部回滚，现有数据不变 |
| 指标新增/改名/归档 | `metrics`（改名时不动历史 `entryMetrics.unit`） | 回滚 |
| 导出 | 只读，不需要事务 | — |

### 3.4 派生数据重建

```ts
// src/db/repositories/entries.ts（示意）
export async function saveEntry(input: EntryInput) {
  // 事务外完成全部纯计算
  const existing = await getEntryMetrics(input.id);          // 该条已有的快照
  const definitions = buildDefinitions(await listMetrics(), existing);
  const parsedTags = parseTags(input.content);
  const parsedMetrics = parseMetrics(input.content, definitions);

  return db.transaction(
    'rw',
    db.entries, db.tags, db.entryTags, db.entryMetrics, db.kv,
    async () => {
      await db.entries.put(row);
      await db.entryTags.where('entryId').equals(row.id).delete();
      await db.entryMetrics.where('entryId').equals(row.id).delete();

      const tagIds = await upsertTags(parsedTags);
      await db.entryTags.bulkPut(tagIds.map((tagId) => ({
        entryId: row.id, tagId, occurredAt: row.occurredAt,
      })));

      await db.entryMetrics.bulkPut(parsedMetrics.map((m) => ({
        id: crypto.randomUUID(), entryId: row.id, ...m,
      })));

      await db.kv.delete('draft');
      await gcOrphanTags();   // 事务内，标签无引用即删除（PRD FR-03）
    },
  );
}
```

**指标改名/改单位后的重建规则**（PRD FR-09-3/4 与 §8.2-2 的冲突点）：

- 每次保存仍然「整条重建」，但解析定义 = **当前指标定义 + 该条目已有的历史别名**；
- 历史别名来自该条目的 `entryMetrics.nameSnapshot` / `entryMetrics.unit`。正文里还是旧名称或旧单位时，按别名命中，写回时保留旧快照；
- 因此「把体重单位从 kg 改成斤」后，未编辑的旧条目仍显示 `70.5 kg`；用户真的把正文改成 `斤`，才会用新定义命中并写入新快照；
- 新条目只使用当前定义，不会命中已归档指标。

> 已知边界：JSON 备份按 PRD 契约不包含派生数值，因此「改过指标单位 → 导出 → 再导入」时，旧条目只能按**当前**定义重建，可能丢失历史数值。这是 PRD 契约本身的限制，已作为决策 D3 接受（见 §13.1）；不擅自扩展 `schemaVersion = 1`。

### 3.5 迁移策略

MVP 只有 `version(1)`，但**从第一版就建立迁移纪律**：

1. 每次加字段/加表必须新增 `db.version(n+1).stores({...}).upgrade(tx => ...)`，不改 `version(1)`；
2. 每个迁移在 `src/db/__tests__/migrations.test.ts` 里用一个真实的旧版本数据库文件/构造器验证，断言升级后条数与关键字段；
3. 迁移只做「补默认值、搬字段」，不做业务计算；派生数据在迁移后按正文重建；
4. MVP 不自动导出（功能冻结）；升级前把当前 `schemaVersion` 与各表条数打到 console，升级后做同样的统计并对比；

> 这套纪律直接对应调研中 Easy Diary 的教训：数据结构要简单，迁移要能验证、能回滚。

### 3.6 容量与查询

- 1 万条 × 平均 100 字 ≈ 几 MB，远低于配额；真正的风险是浏览器清存储，不是容量。
- 时间线：`[deletedAt+pinned+occurredAt+createdAt+id]` 复合索引，游标是 `(occurredAt, createdAt, id)` 三元组，同一毫秒的记录不会重复或漏条；置顶区用 `[0, 1, min, min, ...]` 的区间单独查，主列表用 `[0, 0, ...]`（PRD FR-05-3：置顶不再出现在日期分组）。
- 标签筛选：`entryTags` 上的 `[tagId+occurredAt+entryId]` 游标分页（带 `entryId` 保证同一毫秒也能稳定翻页），每批多取几条、批量 `entries.bulkGet`，过滤掉软删除后补足 50 条；不一次性取全量 id（否则 1 万条会全渲染）。
- 日历打点：由「本地年月」算出当月的 UTC 起止毫秒，用 `[deletedAt+occurredAt]` 做范围查询，再按本地日期归组。一个月最多几百条，不需要额外的日期键，也不受用户时区变化影响。
- 关键词搜索：先按 `[deletedAt]` 索引取回未删除条目，再在内存中做 `content.toLowerCase().includes(...)`。**不要用 Dexie 的 `Collection.filter`**：在 fake-indexeddb 下 1 万条会退化到分钟级；内存过滤实测约 50ms（`npm run test:bench`）。若真机明显超过 100ms，再引入 MiniSearch 内存索引。
- 筛选状态（按天/标签/搜索）统一隐藏置顶区（PRD FR-05-7），三种筛选互斥由 `App` 的状态机保证。

---

## 4. 领域逻辑

### 4.1 标签解析

输入：正文原文。输出：`{ name, start, end }[]`（位置用于高亮）。

| PRD 规则 | 实现 |
|---|---|
| `#` + 1~20 个非空白非 `#` 字符 | 标签名在空白、`#` 或中英文标点处结束；再校验长度 `1 ≤ n ≤ 20`，超长整段不解析，**不截断成 20 字符** |
| `#` 必须在行首、空白或标点之后 | 前置断言 `(?<=^|[\s，。！？、；：,.!?;:（(【[「『"'])` |
| 末尾中英文标点不计入 | 标点本身是标签结束符，因此 `#健康，` 只得到 `健康`；连续标签 `#健康，#运动。` 得到 `健康`、`运动` |
| 英文统一小写 | 仅在「存储与去重」时 `toLowerCase()`，展示仍用原文 |
| URL 片段不误判 | 前置断言排除 `/`、`&`、`=`、字母数字；`https://x/#/path` 不命中 |
| 点击标签筛选 | 用 `name` 查询 `tags` → `entryTags` |

```ts
// src/domain/parse-tags.ts
const NAME = /[^\s#，。！？、；：,.!?;:（）()【】\[\]「」『』"'“”’]+/g;
const BOUNDARY = /(^|[\s，。！？、；：,.!?;:（(【[「『"'])/;

export function parseTags(content: string): ParsedTag[] {
  // 逐行扫描，记录 start/end；遇到 URL 片段由 BOUNDARY 自然排除
}
```

**测试样例**（直接来自 PRD §7 FR-03 验收）：

```
"今天 #健康 很好"                  → 健康
"见 https://example.com/#/path"   → []
"#健康，#运动。"                   → 健康, 运动
"#English #english"               → 一条记录存一个 english，展示保留首次出现
"#123456789012345678901"          → 不解析（超过 20 字符）
```

### 4.2 指标解析

实现顺序（每一步都是纯函数，可单测）：

1. **归一化**：`NFKC` 处理全半角，`toLowerCase()` 仅用于英文比较；保留原文用于 `raw` 与位置。
2. **构造正则**：指标名 `escapeRegExp`，按长度倒序拼接；数字 `-?\d+(?:\.\d+)?`；分隔符 `\s{0,3}` 或 `:`；单位可选。
3. **单位校验**（严格按 PRD）：
   - 单位文本归一化后与 `metric.unit` 一致（`kg` / `KG` / `ｋｇ` 等价）→ 命中；
   - 数字后面紧跟着一个**单位白名单里的其他单位**（如指标是 `kg`，正文写 `70.5 斤`）→ **整段不识别**，保留原文；
   - 数字后面跟的不是白名单单位（如 `体重 70.5 有点重`）→ 视为无单位，正常命中；
   - 数字后无单位 → 命中，`unit` 取指标定义。
4. **重叠处理**：长名称优先，已被占用的区间跳过。
5. **去重**：同一指标保留最后一次匹配。
6. **输出**：`{ metricId, value, unit, raw, start, end }[]`，不修改正文。

**新指标建议**（PRD FR-04）：

- 只在「已存指标都没匹配上」的片段里找候选；
- 名称 2~8 个中英文字符（不含数字与 `#`），单位命中白名单；
- 单条最多 3 个；保存后以非阻塞提示出现；
- 忽略时写入 `entry.extra.ignoredSuggestions`，结构固定为：

```ts
interface IgnoredSuggestion {
  name: string;
  unit: string;
  value: number;
  raw: string;
  ignoredAt: number;   // UTC ms
}
```

- 去重键：`name + unit`。同一文本再次出现、且该键在条目 `extra` 里，就不再提示。
- **降级开关**：`kv.settings.metricSuggestions = false` 时完全关闭，只识别已有指标（PRD 明确保留此预案）。

**单位白名单**（PRD 未列明，已确认为下列集合，见 §13.1 D1）：

```
kg g 斤 cm mm 公里 km 米 m 步 次 元 块 小时 分钟 分 秒 ml L 杯 片 页
```

**性能注意**：任何情况下都不要把用户输入直接拼进正则；指标名必须 `escapeRegExp`，且名称数量少（< 100），避免回溯爆炸。

### 4.3 日期与分组

- `dates.ts` 只暴露本地时区函数：`startOfLocalDay(ts)`、`dateKey(ts)`、`formatGroupTitle(ts, now)`、`calendarGrid(year, month)`。
- `formatGroupTitle`：今天 / 昨天 / `M月D日 周X`；跨年加年份。
- 分组归属按 `occurredAt` 的本地日期，不按 `createdAt`。
- 日历周一开头：`(getDay() + 6) % 7`。
- 「今天/昨天」依赖当前时间：`useNow(60_000)` 每分钟刷新一次；页面 `visibilitychange` 时立即重算，避免跨零点后标题不更新。
- 测试固定 `TZ=Asia/Shanghai`，并对跨年、月末、闰日各写一条用例。

### 4.4 纯函数约束

`src/domain` 的所有函数必须：

- 无 IO、无 `Date.now()`（当前时间作为参数传入）；
- 不读全局配置（单位白名单、限制值从参数或常量传入）；
- 相同输入必得相同输出，便于快照测试与导入预演。

---

## 5. UI 与交互

### 5.1 页面拆分

| 界面 | 组件 | 加载方式 |
|---|---|---|
| 主界面 | `App` + `Composer` + `Timeline` + `SearchBar` + `FilterBar` | 首屏 |
| 日历 | `CalendarSheet` | 打开时按需挂载 |
| 编辑面板 | `EntryEditor`（原生 `<dialog>`） | 首屏 |
| 设置 | `SettingsPage` | `React.lazy` 动态加载 |

**无路由**：设置页用 `view: 'main' | 'settings'` 状态切换；日历、搜索、编辑都用弹层，避免历史栈问题。PWA 从主屏启动永远落在主界面，符合「打开即写」。日历弹层只在 `calendarOpen` 为真时挂载，避免首页每分钟刷新 `now` 时重置已切换的月份视图。

> Android 返回键：MVP 不额外拦截，弹层可用 ESC / 关闭按钮退出；返回键会退出页面或 PWA，这是单页应用的预期行为。P1 若需要「返回关闭弹层」，再为弹层压入 history 条目。若后期加路由，统一用 Hash 模式。

### 5.2 状态管理

| 状态 | 位置 | 理由 |
|---|---|---|
| 记录、标签、指标、entryMetrics | IndexedDB | 唯一真相 |
| 时间线数据 | `useLiveQuery` | 写入后自动刷新，无需手工失效 |
| 草稿 | IndexedDB `kv` + `useDraft` | 刷新/锁屏后可恢复 |
| 筛选（天/标签/搜索词） | `App` 内单一 `EntryFilter` + `useState` | 三种筛选互斥，集中在一处避免组合状态 |
| 弹层开关 | 就近组件 | 不跨层共享 |
| 上次导出时间 | `kv` + `useLiveQuery` | 设置页与红点共用 |

不引入 Redux/Zustand/Jotai：当前没有跨页面共享的复杂客户端状态，引入只会多一层同步问题。

### 5.3 草稿、提交与撤销

- 输入：多行；移动端回车换行，不提交；桌面端 `Ctrl/Cmd + Enter` 提交；点「记录」按钮提交。
- 提交时间：未指定时用提交瞬间的 `Date.now()`，不用页面上每分钟刷新的 `now`，避免整分钟误差；期间用 `submitting` 防止重复写入。
- 空提交：去空白后为空 → 不写入、不报错、不清空输入框（PRD FR-01-3）。
- 草稿：`onChange` 防抖 300ms 写 `kv.draft = { content, occurredAt }`；提交成功或主动清空后删除；恢复时 Toast 提示。
- 草稿与「补记」共用：补记只把 `occurredAt` 预设为该日期 + 当前时分，正文草稿保留；取消「记录到 X」chip 时 `occurredAt` 回到当前时间，正文不变。`Composer` 通过带自增 `id` 的 `backfillRequest` 处理重复点击，并在草稿恢复完成后聚焦输入框。
- 搜索：`SearchBar` 内部维护输入框内容，输入后防抖 200ms 再通知 `App`；关闭搜索只清除搜索筛选，不会覆盖按天筛选。搜索同时匹配正文与标签名，正文命中用 `<mark>` 高亮。
- 日历：打开时按需挂载；点某天 → `App` 切换为按天筛选并关闭日历，再次点同一天则取消筛选；选择日期会关闭搜索并替换当前筛选。
- 删除：条目 `…` 菜单或编辑面板 → **二次确认**「删除这条记录？」→ 写 `deletedAt` → 5 秒 Toast 可撤销 → 超时后从时间线、日历打点、搜索、导出中全部消失。
- 置顶：`…` 菜单直接切换，写入后用 `useLiveQuery` 自动把条目移到置顶区；置顶区不分页，且不会在日期分组里重复出现。
- 时间线分页：首屏 50 条，点「加载更早」或滚动到哨兵元素时 `pageSize += 50`。jsdom 没有 `IntersectionObserver` 时只保留按钮，不影响测试。
- 编辑面板字段：正文、发生时间（日期 + 时分）、置顶开关、删除、保存（PRD §6.3）；正文为空时禁用保存并提示「请使用删除」。
- 编辑保存时保留 `extra`，并按新正文重新计算「新指标建议」；已忽略的建议按 `name + unit` 去重，不重复提示。
- 空状态：时间线显示引导语与一行示例格式（不写库）；搜索无结果显示「没有找到相关记录」；筛选状态显示可关闭的 chip 并隐藏置顶区。

### 5.4 移动端适配

- `index.html` viewport：

```html
<meta name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
<meta name="theme-color" content="#ffffff" />
```

- `interactive-widget=resizes-content` 让 Android Chrome 键盘弹出时缩内容区，而不是顶起 fixed 元素；再用 `visualViewport` 的 `resize` 兜底，把提交按钮保持在可视区域内。
- 安全区：`padding-bottom: env(safe-area-inset-bottom)`；主容器用 `100dvh`，不用 `100vh`。
- 最小宽度 320px；点击区域 ≥ 44×44px；正文行高 1.6，深色模式未启用时对比度 ≥ 4.5:1。
- 字体用系统栈（`system-ui, "Noto Sans SC", sans-serif`），不下载 Web Font，避免首屏抖动与额外请求。

### 5.5 可访问性

- 图标按钮必须有 `aria-label`；
- 弹层使用 `<dialog>` + 焦点管理，关闭后焦点回到触发元素；
- Toast 用 `role="status"`，不抢焦点；
- 标签 chip 可键盘聚焦，激活后进入筛选；
- 搜索结果高亮只改背景色，不改变文字颜色对比度。

### 5.6 设置页

- 入口：主界面右上角「设置」；`view` 切到设置页时卸载 `Composer` / `Timeline`，返回后重新挂载。
- 红点：由 `describeBackup(lastExportAt, now)` 统一计算。从未导出也算需要备份；≤ 14 天不提醒，第 15 天起显示红点，按钮可访问名同时带「需要备份」。
- 备份区：显示「尚未备份 / 上次导出：N 天前」；提供导出 JSON、导出 Markdown、导入 JSON 三个动作。
- 导入：选择文件后先本地校验并弹出「导入预览」（条目数 / 指标数 / 时间范围）；点「导入并覆盖」后才自动下载当前 JSON 保险备份，再单事务覆盖。失败时在弹窗内报错，原数据不动。
- 指标管理：新增、编辑、归档 / 恢复；已归档项在列表里标记「已归档」，历史记录中的指标快照不受影响。
- 关于：版本号直接读 `package.json`，与后续 SW 更新提示共用，便于用户报障时确认版本。

---

## 6. 导出与导入

### 6.1 契约

严格遵循 PRD §8.3 的 `schemaVersion = 1`，不额外加顶层字段。`extra.ignoredSuggestions` 的形状在 §4.2 固定。

**内部行 ↔ 导出契约必须显式映射**（`toExportJson` / `fromExportJson`，不许直接把 Dexie 行序列化）：

| 内部字段 | JSON 字段 | 规则 |
|---|---|---|
| `pinned: 0 \| 1` | `pinned: boolean` | 导出 `=== 1`；导入 `? 1 : 0`，绝不把 boolean 写进索引 |
| `archived: 0 \| 1` | `archived: boolean` | 同上 |
| `deletedAt` | — | 只导出 `deletedAt === 0` 的行；导入一律写 `0` |
| `nameLower` | — | 导入时由 `name` 重新计算，不信任文件 |
| `nameSnapshot`、`unit` 快照 | — | 内部派生数据，不导出；导入后按正文重建 |
| `extra` | `extra` | 原样透传；缺失时补 `{ ignoredSuggestions: [] }` |
| `id` | `id` | 校验 UUID 格式与全局唯一 |
| `occurredAt` 等时间 | 同名字段 | 校验为有限整数（毫秒），不接受字符串 |

> 这张表是 FR-10 round-trip 的成败关键：字段名只差一个 `pinned` 的类型，就会导致导出后该条从索引中消失。

### 6.2 导出

- **JSON**：只导出 `deletedAt = 0` 的条目与全部指标（含归档）；不导出标签与数值表（导入时由正文重建，PRD §7 FR-10）。
- **Markdown**：按本地日期分组，标题 `## 2026-11-17 周一`；每条 `- HH:mm 正文`，有指标时下一行缩进 `  - 体重 70.5 kg`；正文中的 `#` 原样保留。
- 文件名与时间戳严格按 PRD；用 `Blob` + `<a download>` 触发下载（Android Chrome 会落到下载目录）。
- 成功后写 `kv.lastExportAt = Date.now()`，设置页红点消失。**只有 JSON 导出计入**；Markdown 不可导入，不算备份。
- 生成逻辑放 `domain/export-*.ts`，输入是普通对象，便于快照测试。

### 6.3 导入流程

```
选择文件
  → 读文本，限制 ≤ 50 MB
  → JSON.parse（失败：提示「文件不是有效的 JSON」）
  → Zod 校验结构 + schemaVersion === 1（失败：提示具体字段，不写库）
  → 预览：条目数 / 指标数 / 时间范围（不写库）
  → 二次确认「导入并覆盖」
  → 自动导出一份当前数据（保险）
  → db.transaction('rw', 全部表):
       clear 所有表
       bulkPut metrics / entries（extra 原样）
       kv: 清草稿；保留 lastExportAt 与 settings（如指标建议开关）
       按正文重建 tags / entryTags / entryMetrics
  → 成功：Toast 摘要；失败：事务回滚 + 明确错误
```

**要点**：

- 校验与解析在事务前完成；事务内只做 `clear`、标签 upsert、`bulkPut` 与派生数据写入，避免在事务里做正则和 JSON 解析；
- 重建失败必须抛错让事务回滚，不能「跳过坏数据继续」；
- 导入不信任文件里的 id：重复 id **直接报错**（PRD 未授权静默覆盖），在预览阶段就拦下；
- 导入后把 `schemaVersion` 写回 `kv`，供未来迁移判断。

### 6.4 错误文案

| 场景 | 提示 |
|---|---|
| JSON 语法错误 | 文件内容损坏，无法解析 |
| 版本不匹配 | 备份的 schemaVersion 为 2，当前应用只支持 1 |
| 缺字段/类型错误 | 备份文件不完整：`entries[3].occurredAt` 无效 |
| 事务失败 | 导入失败，原有数据保持不变 |
| 导入成功 | 导入完成：128 条记录、3 个指标 |

### 6.5 测试重点

- **round-trip**：造 3 条含标签/指标/置顶/忽略建议的数据 → 导出 JSON → 清库 → 导入 → 逐字段 `toEqual`；
- **损坏文件**：截断 JSON、改 `schemaVersion`、把 `occurredAt` 改成字符串 → 断言错误且原数据条数不变；
- **重建一致性**：导入后 `entryTags` / `entryMetrics` 与正文解析结果一致；
- **改名/改单位**：把单位从 `kg` 改成 `斤` → 未编辑的旧条目仍显示 `kg`（别名命中）；把正文改成 `70.5 斤` 后按新单位写入；再导入备份时按当前定义重建（已知边界，用测试把行为钉死）；
- **大文件**：1 万条导入耗时与内存（标记为 slow test，不进默认 CI 或单独 job）。

---

## 7. PWA 与部署

### 7.1 manifest 与图标

| 字段 | 值 |
|---|---|
| `name` / `short_name` | 日常记录 / 日常 |
| `display` | `standalone` |
| `start_url` / `scope` | `./`（跟随 Vite `base`） |
| `theme_color` / `background_color` | 待视觉定稿，暂用 `#ffffff` |
| `lang` | `zh-CN` |
| `icons` | 192、512、512 maskable |

图标直接复用 `favicon.svg` 里的圆角黑板 + 三条横线，由 `scripts/generate-icons.mjs` 以像素采样生成三份 PNG；maskable 版本铺满画布，保证安卓图标裁切后内容仍在安全区。`npm run icons` 可重新生成，`npm test` 会检查尺寸与 PNG 格式。

### 7.2 Service Worker 策略

```ts
// vite.config.ts
VitePWA({
  registerType: 'prompt',
  injectRegister: null,           // 由应用自己注册，方便测更新提示
  manifest: { /* 见上表 */ },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
    navigateFallback: 'index.html',
    cleanupOutdatedCaches: true,
    clientsClaim: true,
    runtimeCaching: [],          // 除静态资源外不发起任何请求
  },
  devOptions: { enabled: false },
})
```

- **只预缓存、不做运行时缓存**：PRD 要求除静态资源外零请求，避免缓存策略带来一致性 bug。
- **注册与更新提示**：`src/pwa/use-pwa-update.ts` 手动注册 `${BASE_URL}sw.js`；`updatefound` 后新 worker 进入 `installed` 且当前页仍被旧版本控制时才显示顶部条。点「刷新」才发 `SKIP_WAITING` 并 reload；草稿非空时文案改成「有新版本，保存后再刷新」，只给「稍后」按钮，**绝不自动 reload**（PRD FR-11）。
- **离线**：首次访问安装 SW 后，断网可打开、记录、搜索、导出；E2E 覆盖。
- **缓存清理**：`cleanupOutdatedCaches` + 版本化 precache manifest，避免旧 JS 混用。

### 7.3 GitHub Pages 配置

- 仓库 Settings → Pages → Source 选 **GitHub Actions**；
- Vite `base` 从环境变量注入，CI 里设为 `/<repo>/`；
- `start_url`、`scope` 用相对路径，避免子路径下安装到桌面后白屏；
- 无 Router，不需要 404.html 兜底；
- 仓库已确定为**公开**的 `daily-record`；若将来改私有，需 GitHub Pro 才能开 Pages，或改用 Cloudflare Pages（方案不变，只换部署步骤）。

```ts
// vite.config.ts
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss(), VitePWA({ /* ... */ })],
});
```

### 7.4 CI / CD

`.github/workflows/ci.yml`：

```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
```

`.github/workflows/deploy.yml`：

```yaml
name: deploy
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
        env:
          VITE_BASE: /${{ github.event.repository.name }}/
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

> 部署流水线先跑测试再构建，延续 `agent.md` 的「测试全过才算完成」。

### 7.5 存储持久化

- 首次成功写入后调用 `navigator.storage.persist()`（不弹窗、不加 UI），降低被清理概率；
- 设置页显示「上次导出」，超过 14 天在设置图标上打红点（PRD FR-12）；
- 明确写进用户文档：**导出文件是唯一可靠备份**，清理浏览器数据会丢记录。

---

## 8. 性能预算与验证

| 指标 | 预算 | 验证方式 |
|---|---|---|
| 首屏 JS（gzip） | ≤ 120 KB | `vite build` 产物体积；CI 记录 |
| 首屏 CSS（gzip） | ≤ 20 KB | 同上 |
| 冷启动（中端 Android，已缓存） | ≤ 2 s | M5 真机 + Lighthouse |
| 输入回显 | ≤ 100 ms | 真机 + React Profiler |
| 打开数据库 | ≤ 100 ms | 启动打点（`performance.mark`） |
| 时间线首屏 50 条 | ≤ 300 ms | 本地插桩；Playwright 断言可见时间 |
| 1 万条关键词搜索 | ≤ 100 ms | `bench` 测试；超标再上 MiniSearch |
| 单条写入 | ≤ 100 ms | 本地插桩 |

**优化顺序**（只在超标时做）：

1. 设置页/导入模块 `React.lazy` + 动态 `import('zod')`；
2. 时间线只取展示字段（`content` 截断在 UI 层，不额外查表）；
3. 列表行 `content-visibility: auto`；
4. 搜索上内存索引（MiniSearch）；
5. 最后才考虑虚拟列表（当前每页 50 条，收益低）。

---

## 9. 测试策略

### 9.1 分层

| 层 | 工具 | 范围 | 目标 |
|---|---|---|---|
| 领域单测 | Vitest | 标签/指标解析、日期分组、导出、导入校验 | 分支覆盖 ≥ 90% |
| 数据层 | Vitest + fake-indexeddb | 事务、软删除过滤、派生重建、迁移、分页 | 分支覆盖 ≥ 85% |
| 组件 | Vitest + RTL | Composer、Timeline、筛选、编辑器 | 关键交互 |
| E2E | Playwright | 冒烟、离线、下载/导入、窄屏 | PRD §10.1 |

### 9.2 用例矩阵（对应 PRD）

| PRD | 测试 | 类型 |
|---|---|---|
| FR-01 快速记录 | 空格不写入；提交后置顶出现；时间重置 | 组件 + E2E |
| FR-02 草稿 | 防抖写入、刷新恢复、提交后清除 | 组件 + 数据层 |
| FR-03 标签 | 5 组解析样例、URL 排除、点击筛选 | 单测 + 组件 + E2E |
| FR-04 指标 | 单位匹配、大小写/全角、重复取最后、建议与忽略 | 单测 |
| FR-05 时间线 | 置顶分组、6 行折叠、分页 50、删除消失 | 组件 + E2E |
| FR-06 日历 | 周一开头、打点、补记、跨月跨年 | 单测 + 组件 + E2E |
| FR-07 搜索 | 防抖、高亮、三种筛选互斥 | 组件 + E2E |
| FR-08 编辑删除 | 空正文不可保存、改时间移动分组、5 秒撤销 | 组件 + E2E |
| FR-09 指标管理 | 重名拒绝（含已归档）、名称/单位长度与非法字符、归档后不参与识别、历史单位快照、归档可恢复 | 单测 + 组件 |
| FR-10 导出导入 | round-trip 零丢失、坏文件不破坏数据、文件名、预览与保险导出 | 单测 + 组件 + E2E |
| FR-11 PWA | manifest 结构与图标可访问、离线写读、更新提示不自动刷新（真实安装由真机手验） | E2E + 单测 + 组件 |
| FR-12 备份提醒 | 从未导出提示、0 天/14 天边界、红点显示与消失 | 单测 + 组件 |

### 9.3 测试基础设施

```ts
// src/test/setup.ts
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// 时区通过 vitest.config.ts 的 test.env.TZ 设置，避免运行时改 TZ 在 Windows 上不生效

afterEach(() => cleanup());
```

- 每个数据层/组件测试用 `src/test/db.ts` 的 `makeTestDb()` 建独立库，`afterEach` 调 `cleanupTestDbs()` 删除，避免串数据；
- 时间相关测试用固定时间戳或 `vi.setSystemTime()`，不 sleep；`useNow` 的每分钟刷新不参与断言；
- 原生 `<dialog>` 在 jsdom 里没有 `showModal()`，`Modal` 自动退回 `open` 属性，组件测试可以直接交互；
- 搜索基准用独立的 `vitest.bench.config.ts`，默认 `npm test` 通过 `exclude` 跳过 `*.bench.test.*`；
- E2E 的 `webServer` 先构建再 `vite preview`，确保测的是产物而不是 dev server；
- Playwright 只跑 Chromium（Android Chrome 同源内核），`viewport: { width: 360, height: 800 }`。

### 9.4 E2E 必跑场景

> M2 已落地场景 1、5 与冒烟；M3 已补齐场景 2、3、4；M4 已补齐场景 6（含损坏文件不破坏原数据）；M5 已补齐场景 7（离线刷新后仍可记录）与场景 8（320px 窄屏）。八个场景全部有自动化覆盖；「从主屏幕启动无地址栏」仍需真机手验。

1. 打开 → 写一条 → 刷新 → 仍存在（含离线版本）；
2. 写标签 → 点击 → 只剩该标签，关闭 chip 恢复；
3. 日历选昨天 → 补记 → 出现在昨天分组；选未来日期同样允许；
4. 搜索关键词 → 高亮 → 点编辑 → 修改 → 时间线更新；
5. 删除 → 撤销；再删除 → 5 秒后消失；
6. 导出 JSON → 测试内清空 IndexedDB → 重新加载 → 导入 → 条数与内容一致；
7. 断网刷新 → 可打开、可记录、可导出；
8. 320px 视口无横向滚动，提交按钮可见。

> 离线用例的前置条件：首次加载后必须 `await navigator.serviceWorker.ready`，再 `reload()` 一次确认页面已被 SW 接管，然后才 `context.setOffline(true)`。仅设置 offline 不保证 SW 已接管，会测出假阴性。

### 9.5 覆盖率与门禁

- `npm test` = 文档校验 + Vitest（默认不跑 10k 基准与 E2E）；
- `npm run test:bench` = 1 万条搜索基准（`vitest.bench.config.ts`）；
- `npm run test:e2e` = Playwright；
- `npm run test:all` = 两者；
- 覆盖率阈值：`src/domain` ≥ 90%，`src/db` ≥ 85%；低于阈值 CI 失败；
- 每次改动必须 commit，且 CI 全绿才算完成（`agent.md` 规则 1、2）。

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "node scripts/check-docs.mjs && vitest run",
    "test:watch": "vitest",
    "test:bench": "vitest run --config vitest.bench.config.ts",
    "test:e2e": "playwright test",
    "test:all": "npm test && npm run test:e2e",
    "lint": "biome check",
    "lint:fix": "biome check --write"
  }
}
```

---

## 10. 实施顺序

| 里程碑 | 交付物 | 完成标准（DoD） |
|---|---|---|
| **M0 脚手架** | Vite + React + TS + Tailwind、Biome、Vitest、Playwright、CI | `npm test` 绿；CI 能跑；空页面可启动 |
| **M1 数据层 + 解析器** | schema、仓储、标签/指标解析、导出/导入纯函数、迁移测试 | 领域与数据层测试全过；1 万条写读基准达标 |
| **M2 主路径** | Composer（含草稿、时间归属、解析预览）+ Timeline（分组、置顶、分页、删除撤销） | PRD FR-01/02/05/08 验收；E2E 场景 1、5 绿 |
| **M3 回顾与筛选** | 日历（打点、补记）、搜索（高亮、互斥筛选）、编辑面板 | FR-03/06/07 验收；E2E 场景 2、3、4 绿 |
| **M4 数据安全** | JSON/Markdown 导出、导入（预览、二次确认、单事务）、指标管理、备份提醒 | FR-09/10/12 验收；round-trip 与坏文件测试绿 |
| **M5 PWA 上线** | manifest/图标、SW 更新提示、GitHub Pages 部署、真机适配 | FR-11 + §10.1 全部验收；真机手动确认可安装、独立窗口、飞行模式可用；E2E 校验 manifest/SW |
| **M6 产品验收** | 连续 7 天真实记录 | PRD §10.2 |

> 进度（2026-11-18）：M0～M5 已完成，`npm test`（201 个）、`npm run test:e2e`（11 个）、`npm run lint` 与生产构建均通过；下一步进入 M6（连续 7 天真实使用），上线前只需真机确认「添加到主屏幕 / 独立窗口 / 飞行模式」。

> 参考工作量：M0 0.5 人日、M1 1.5、M2 2、M3 2、M4 1.5、M5 1，合计约 8.5 人日；M6 是 7 天真实使用，不占开发时间。估算只用于排期，不作为承诺。

**建议的提交粒度**（符合 `agent.md`）：

1. `chore: 初始化 Vite + React + TS 脚手架`
2. `feat: 新增 Dexie 存储与条目仓储`
3. `feat: 实现标签与指标解析`
4. `feat: 完成快速记录与时间线`
5. `feat: 新增日历、搜索与编辑`
6. `feat: 实现导出导入、指标管理与备份提醒`
7. `feat: 配置 PWA 与 GitHub Pages 部署`

每个 commit 都必须带对应测试并通过，禁止把多个里程碑压成一个提交。

---

## 11. 技术风险

| 风险 | 影响 | 对策 |
|---|---|---|
| IndexedDB 被浏览器清理 | 全部数据丢失 | `persist()` + 14 天备份提醒 + 导出作为发版门槛 |
| Dexie 事务被非 Dexie await 打断 | 部分写入、数据不一致 | 事务内只做 Dexie 操作；解析/校验提前完成；事务测试兜底 |
| 中文输入法 composition 期间解析抖动 | chip 乱跳、卡片闪烁 | `compositionstart/end` 期间只更新正文，`compositionend` 后再解析 |
| 指标正则回溯 | 输入卡顿 | 名称转义 + 名称按长度倒序 + 限制指标数量 |
| GitHub Pages 子路径 | 安装后白屏、SW 404 | `base`/`scope`/`start_url` 用相对路径；部署后真机验证 |
| SW 缓存旧版本 | 用户看到旧 bug | `prompt` 更新 + 设置页版本号 + `cleanupOutdatedCaches` |
| Android 键盘遮挡 | 看不到提交按钮 | `interactive-widget` + `visualViewport` + 真机 320~430px 验证 |
| 10k 条搜索变慢 | 输入卡顿 | 先扫描；基准超 100ms 再上 MiniSearch |
| React StrictMode 双执行 | 重复写入 | 写操作幂等（按 id put）；不在 `useEffect` 里做提交 |
| 导入大文件内存峰值 | 页面崩溃 | 50MB 上限 + 预检条目数 + 事务外构建对象 |

---

## 12. 备选方案与不选原因

| 备选 | 不选原因 |
|---|---|
| SQLite WASM + OPFS | wasm 1MB+ 拉长冷启动；部分部署组合需要 COOP/COEP 响应头，GitHub Pages 无法配置；PRD 的查询复杂度用 IndexedDB 足够 |
| localStorage | 同步阻塞、5MB 上限、无事务、无索引，直接排除 |
| Next.js / SSR | 纯静态单机应用不需要服务端渲染；SSR 还会引入 Node 运行时与部署复杂度 |
| Svelte 5 | 包体更小，但生态/测试资料少于 React，单人维护与排障成本优先 |
| Redux / Zustand | 没有跨页面复杂客户端状态；`useLiveQuery` 已覆盖数据订阅 |
| TanStack Query | 面向 HTTP 缓存，本地 IndexedDB 不适用 |
| 组件库（Mantine 等） | 四个界面、风格需定制，库的默认样式与包体不划算 |
| date-fns / Day.js | 仅本地时区展示与分组，原生 API 足够；少一个依赖少一类时区 bug |
| 自建 Node 后端 | PRD 明确无账号、无同步、无服务器；部署与备份成本都不划算 |
| TWA / Capacitor 打包 APK | MVP 目标是验证「是否天天用」，PWA 已能安装；上架成本留到 P1 |

---

## 13. 决策记录与待确认事项

### 13.1 已确认（2026-11-17）

| 编号 | 事项 | 结论 | 落点 |
|---|---|---|---|
| D1 | 单位白名单 | 采用 §4.2 的推荐清单：`kg g 斤 cm mm 公里 km 米 m 步 次 元 块 小时 分钟 分 秒 ml L 杯 片 页` | §4.2 即最终值，`src/domain/constants.ts` 单一来源 |
| D2 | 仓库 | **公开**仓库，名称 `daily-record`（ASCII） | §7.3 的 `base = /daily-record/` |
| D3 | 改单位后的备份语义 | **先接受**已知边界：备份按当前定义重建，旧条目的小标签可能消失；正文与指标定义不丢 | §3.4 的已知边界，不改 `schemaVersion = 1` |

> D1 的补充：白名单只影响「新指标建议」是否出现，不影响手动在设置里新增指标；以后增删单位只改常量，不迁移数据。
> D3 的补充：若将来要补全，可给 `extra` 增加 `entryMetrics` 快照并升 `schemaVersion`，属于独立改动，不在 MVP 内。

### 13.2 仍待确认（不阻塞 M0）

1. **应用名 / 图标 / 主题色**：影响 manifest 与首屏视觉，M5 前定即可；暂用「日常记录 / 日常」与 `#ffffff`。
2. **深色模式**：实现成本约 0.5 人日（CSS 变量 + `prefers-color-scheme`），PRD §13.4 将其列为开放问题、默认 P1；建议守规则，不破例。
3. **是否需要 TWA 上架应用商店**：不影响 MVP 技术选型，P1 再评估。

---

## 附录 A：版本清单（2026-11-17 npm latest）

| 包 | 版本 |
|---|---|
| node | 24.x LTS |
| typescript | 7.0.2 |
| vite | 8.3.8 |
| @vitejs/plugin-react | 6.3.0 |
| react / react-dom | 19.3.1 |
| dexie | 4.4.7 |
| dexie-react-hooks | 4.4.0 |
| tailwindcss / @tailwindcss/vite | 4.3.5 |
| zod | 4.6.7 |
| vite-plugin-pwa | 2.0.0 |
| vitest | 5.1.0 |
| jsdom | 29.0.0（31.x 要求 Node ≥ 24.15；本地 24.14 会告警） |
| @testing-library/react | 16.3.3 |
| @testing-library/jest-dom | 7.0.1 |
| fake-indexeddb | 6.2.8 |
| @playwright/test | 1.65.1 |
| @biomejs/biome | 2.6.8 |

> 安装时锁 `package-lock.json`；升级依赖单独提交，并跑完整测试。

## 附录 B：关键配置骨架

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: '日常记录',
        short_name: '日常',
        start_url: './',
        scope: './',
        display: 'standalone',
        lang: 'zh-CN',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        icons: [
          { src: 'icons/192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [],
      },
    }),
  ],
});
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    env: { TZ: 'Asia/Shanghai' },
    coverage: {
      provider: 'v8',
      include: ['src/domain/**', 'src/db/**'],
      thresholds: {
        'src/domain/**': { lines: 90, branches: 90 },
        'src/db/**': { lines: 85, branches: 85 },
      },
    },
  },
});
```

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: { ...devices['Pixel 7'], locale: 'zh-CN', timezoneId: 'Asia/Shanghai' },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
```
