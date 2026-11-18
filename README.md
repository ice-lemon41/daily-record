# 日常记录

单机、本地优先的随手记。M5（PWA 上线）已完成：可以写记录、按天查看、编辑、置顶与删除撤销，也能点标签筛选、搜索高亮、日历补记；设置页支持导出 JSON/Markdown、导入 JSON、管理指标和备份提醒。现在可以用 Android 浏览器「添加到主屏幕」，独立窗口打开；首次联网访问后会预缓存应用外壳，飞行模式下仍可打开、记录、搜索和导出。发现新版本时只提示，不会自动刷新。数据全部保存在浏览器本地。

产品需求与技术方案见 [`docs/PRD-MVP.md`](./docs/PRD-MVP.md)（MVP 冻结版 v0.1）和 [`docs/日常记录-MVP技术方案.md`](./docs/日常记录-MVP技术方案.md)。

## 本地命令

| 命令 | 作用 |
|---|---|
| `npm install` | 安装依赖 |
| `npm run dev` | 启动本地开发服务器 |
| `npm test` | 文档校验 + 单元/组件测试（提交前必须通过） |
| `npm run test:coverage` | 额外生成覆盖率报告 |
| `npm run test:bench` | 1 万条记录下的搜索基准（不随 `npm test` 运行） |
| `npm run icons` | 重新生成 PWA 图标（192/512/maskable PNG） |
| `npm run test:e2e` | Playwright 端到端测试（首次需 `npx playwright install chromium`） |
| `npm run lint` | Biome 检查代码风格与常见问题 |
| `npm run build` | 类型检查 + 生产构建（产物在 `dist/`） |

## 部署

推送到 `main` 后，GitHub Actions 会先跑测试与构建，再发布到 GitHub Pages。
仓库需在 Settings → Pages 中将 Source 设为 **GitHub Actions**。
