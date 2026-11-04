# dsh-skills-tools v1.1 设计与开发计划

## 1. 目标

把「平铺的技能列表」升级为「以仓库为单位的技能管理器」，对齐 Cursor / Codex 的技能管理心智模型：

- 仓库是管理单元，技能挂在仓库下，可折叠；
- 仓库按「有启用技能 → 无启用技能」排序，组内按名称；
- 仓库内技能按「已启用 → 未启用」排序；
- 仓库显示名称、可点击链接、技能数量（已导入 / 仓库总数）、启用数量、提交号、更新状态；
- 支持「只导入了部分技能」的仓库再次导入剩余技能；
- 技能行右侧 chevron 可展开/收起，展开后显示来源、路径、操作与 SKILL.md 正文；
- 仓库级开关一次启用/停用该仓库全部技能。

## 2. 信息架构

```
Settings → Skills
├─ 页头：标题 / 说明 / 刷新 / 导入技能
├─ 概览：总数、已启用、DSH 已加载 + 批量操作 + 检查更新 + 事件
├─ 搜索 + 过滤（全部 / 已启用 / 未启用）
├─ 仓库分组（按排序规则）
│  ├─ 仓库头：折叠箭头 | 名称 | 外链 | ref/commit | 更新标记
│  │           | 启用/已导入 | 共 N 个技能 | 仓库开关 | 导入更多
│  └─ 技能行（已启用优先）
│     ├─ 开关 | 名称 + 标记 | 描述 | 路径 | 展开箭头
│     └─ 展开面板：来源 / commit / 路径 / 更新时间 / 操作 / SKILL.md 正文
└─ 底部：状态文件路径提示
```

## 3. 排序与筛选规则

- 仓库：`enabledCount > 0` 在前，其余在后；同组按仓库显示名（owner/repo 或目录名）升序。
- 仓库内技能：`enabled` 降序，再按 name 升序。
- 搜索/过滤作用于技能行；无匹配技能的仓库不显示；仓库头计数始终显示仓库真实统计。
- 过滤为「已启用/未启用」时，仓库头保留，方便跨仓库切换。

## 4. 交互细节

- 仓库头默认展开；点击箭头或名称区域折叠/展开，状态保存在组件内存。
- 仓库开关：全部启用时显示开启；部分启用显示半选（虚线/减号）；点击时「非全开 → 全开，全开 → 全关」。
- 仓库外链：https 仓库转成 web URL 新标签打开；`git@host:owner/repo` 转 `https://host/owner/repo`；本地目录显示路径并可复制。
- 「导入更多」：打开对话框 → 调用 inspect 扫描仓库快照 → 列出未导入技能（已导入的置灰）→ 勾选后导入；导入完成后刷新列表并提示新增/跳过数量。
- 技能 chevron：独立按钮，点击展开；展开后懒加载 `/skills/content` 并展示纯文本正文（最大高度滚动、截断提示）。
- 技能展开面板保留「更新 / 移除 / 复制路径」操作。

## 5. 后端 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/skills-tools/api/state` | 仓库新增 `available`（已知时） |
| POST | `/skills-tools/api/repos/inspect` | `{repoId}` → 扫描仓库快照，返回全部技能及 `imported/enabled` |
| POST | `/skills-tools/api/repos/import` | `{repoId, skills:[{relPath,name}]}` → 从现有快照导入剩余技能 |
| POST | `/skills-tools/api/repos/toggle` | `{repoId, enabled}` → 仓库级批量启用/停用 |

- inspect 有 60s 内存缓存（按 repoId + snapshot），导入/更新/删除后失效。
- import 复用快照，不再克隆；沿用扫描期的命名消歧（`describeScan`）与「同名跨仓库拒绝」策略，返回 `installed/skipped`。
- 仓库记录新增可选字段 `available`（归一化容错，不升级 state version）。
- toggleRepo 只调用一次 `invalidate()`。

## 6. 前端实现要点

- `SkillsSection` 内新增 `expandedRepos`、`repoDialog` 状态；
- 由 `filtered` 技能按 repoId 分组，再按排序规则生成 `groups`；
- 新增 `RepoHeader`（函数内渲染）与 `RepoImportDialog` 组件；
- 修复 chevron：改为独立 `button`，不再嵌套在 rowMain 内且不再依赖 rowActions 容器；
- i18n 中英同步新增 key；
- CSS 新增 repo 卡片、半选开关、chevron 旋转、对话框列表样式，沿用 `--dsw-*` 变量；
- 构建：`node scripts/build-client.mjs`。

## 7. 边界与失败模式

- 仓库快照丢失：inspect 返回明确错误，提示先更新仓库；导入拒绝。
- 同名技能与其它仓库冲突：跳过并在结果中说明原因，不静默覆盖。
- 全部技能已导入：对话框显示「没有可导入的技能」并禁用提交。
- 本地仓库：外链不可点，显示目录路径；inspect 仍可用。
- 过滤/搜索后仓库无匹配技能：整组隐藏，避免空壳。
- inspect 结果很大：沿用 `MAX_IMPORT_SKILLS` 限制与截断提示。

## 8. 测试与验收

- 单测（manager-test）：部分导入 → inspect 数量 → 导入剩余 → 状态/可用数；仓库级 toggle；缓存命中/失效。
- 契约测试（provider-test）：不受影响，保持通过。
- 静态检查（ci-check）：i18n 键对齐、客户端产物可解析、无本地路径泄漏。
- 隔离环境 E2E（临时 DSH_HOME + 独立 profile + Playwright）：
  1. 仓库分组渲染、排序（启用仓库在前）；
  2. 仓库头显示数量与链接；
  3. 技能 chevron 展开显示正文；
  4. 仓库开关半选/全开/全关；
  5. 「导入更多」勾选并导入剩余技能；
  6. 搜索/过滤在分组内的表现。
- 真实环境：安装 v1.1.0 到 desktop profile，重启后复查同样路径。

## 9. 发版

1. 版本 1.1.0；更新 README/API/MARKETPLACES/release notes；
2. `npm test`、`npm run test:manager`、`npm run test:provider`、`npm run ci-check`；
3. 提交、tag `v1.1.0`、GitHub release；
4. `npm publish --access public`；
5. desktop profile 安装 `dsh-skills-tools@1.1.0`，重启应用后做真实环境验收并补 VERIFICATION §7。
