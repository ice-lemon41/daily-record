# 日常记录

单机、本地优先的随手记。当前处于 M0（脚手架）阶段，业务功能尚未实现。

产品需求与技术方案见 [`docs/PRD.md`](./docs/PRD.md) 和 [`docs/日常记录-MVP技术方案.md`](./docs/日常记录-MVP技术方案.md)。

## 本地命令

| 命令 | 作用 |
|---|---|
| `npm install` | 安装依赖 |
| `npm run dev` | 启动本地开发服务器 |
| `npm test` | 文档校验 + 单元/组件测试（提交前必须通过） |
| `npm run test:coverage` | 额外生成覆盖率报告 |
| `npm run test:e2e` | Playwright 端到端测试（首次需 `npx playwright install chromium`） |
| `npm run lint` | Biome 检查代码风格与常见问题 |
| `npm run build` | 类型检查 + 生产构建（产物在 `dist/`） |

## 部署

推送到 `main` 后，GitHub Actions 会先跑测试与构建，再发布到 GitHub Pages。
仓库需在 Settings → Pages 中将 Source 设为 **GitHub Actions**。
