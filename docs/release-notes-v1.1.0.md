# dsh-skills-tools 1.1.0

发布日期：2026-11-04

## 亮点

- **按仓库分组管理**：技能列表改为仓库卡片；每个仓库显示名称、可点击链接、分支/提交、已启用数量、技能总数与仓库地址。
- **仓库级开关**：一次启用/停用整个仓库；部分启用时显示半选状态。
- **排序规则**：仓库按「有启用技能优先」排序，仓库内技能按「已启用优先、再按名称」排序。
- **导入更多**：只导入了部分技能的仓库显示「可导入 N 个」；打开「导入更多」可从现有快照补齐剩余技能，无需重新克隆。
- **技能展开修复**：右侧箭头改为独立按钮，展开后展示 SKILL.md 正文、来源、路径、更新时间及更新/移除操作。
- **仓库链接**：https / git@ 仓库自动转换为网页链接，新标签打开；本地目录显示路径。
- **启动补全仓库统计**：升级后首次启动会扫描已有快照，自动补全仓库的可导入技能总数，历史导入的仓库也能立即显示「共 N 个技能」与「可导入 N 个」。

## API

新增：

- `POST /skills-tools/api/repos/inspect` — 扫描仓库快照，列出全部技能与导入状态；
- `POST /skills-tools/api/repos/import` — 从现有快照补充导入；
- `POST /skills-tools/api/repos/toggle` — 仓库级批量启用/停用。

`GET /state` 的 `repos[]` 新增 `available` 字段。

## 验证

- `npm test`、`npm run test:manager`（17 组）、`npm run test:provider`（7 项）、`npm run ci-check` 全部通过；
- 隔离 profile + Playwright E2E：仓库分组、排序、仓库开关、半选状态、chevron 展开正文、「导入更多」补齐技能均验证通过；
- 截图：`docs/screenshots/skills-grouped.png`。

## 升级

```bash
dsh plugin --profile <profile> add dsh-skills-tools@1.1.0
```

安装后重启 DSH Desktop / dsh web，技能库状态（含已导入技能与启用状态）自动沿用，无需重新导入。
