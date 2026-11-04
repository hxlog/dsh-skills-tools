# 验证记录（v1.0.0）

本文件记录 dsh-skills-tools 1.0.0 的离线测试、隔离环境 E2E 与真实技能触发验收。发布前必须全部为通过。

## 1. 离线测试

命令与结果（2026-11-03，Node 22，Windows）：

    > npm test
    smoke OK: frontmatter + manager + provider + client bundle + locale

    > npm run test:manager
    manager test OK: 14 groups, provider contract + toggles + updates + idempotent re-import

    > npm run test:provider
    provider contract ok: 7 checks passed

    > npm run ci-check
    ci-check OK: manifest + patch + ESM + client bundle + i18n parity

覆盖：

- frontmatter：引号、块标量（| 与 >）、CRLF、BOM、旧式 invocation 键拒绝、非法 name、缺少 description。
- manager：本地 fixture 仓库扫描、重名自动改名（router → 插件名）、无效技能标记、选择安装、幂等重复导入、启停、批量、刷新、上游更新、移除、锁与状态文件。
- provider（scripts/provider-test.mjs）：通过假的 ctx.skills 捕获注册的 provider，断言候选的 name/description/invocation/rank(350)/source、resourceBase 指向快照目录、`../../assets` 相对引用可解析、definition 返回正文；停用后候选被过滤、definition 返回 undefined，启用/批量/恢复各自恰好触发一次 `invalidate()`。
- 客户端：经典脚本可被 vm.Script 解析，包含 settings.section id/order、API 前缀、i18n 键完全对齐。

## 2. 真实仓库扫描（luban）

    https://code.comein.cn/ai/luban.git   ref: pro（仓库默认 HEAD 即 pro）

- 扫描结果：68 个有效 SKILL.md，0 个无法解析，1 个仓库快照。
- 重名自动处理：
  - check → project-docs-check
  - generate → project-docs-generate
  - router → project-docs
- 最终技能名与 luban 现有目录（catalog）完全一致；导入后全部默认启用。

## 3. 隔离 profile E2E

环境（未触碰真实 ~/.dsh）：

- DSH_HOME：`C:\Users\Xingy\AppData\Local\Temp\dsh-skills-e2e`
- profile：`skillsverify`，首次 `dsh plugin --profile skillsverify add file:D:/PythonProjects/dsh-skills-tools` 初始化；
  额外加入 `@deepseek-ai/dsh-web-app@0.2.1-rc.5` 以启用 Web GUI；
  为触发测试在 profile 的 `cordis.patch.yml` 配置 `llm-pi-ai`（comein-new-api / deepseek-v4-flash，apiKeyEnv=COMEIN_NEW_API_KEY）与 `agent-default-model`。
- 启动：`dsh --profile skillsverify --host 127.0.0.1 --port 59610 --no-open`（CLI 不支持 `dsh web --profile ...` 组合，特此记录）。
- 浏览器：Playwright 驱动 Chrome，访问带 token 的 Web GUI。

步骤与断言：

1. 设置页出现「技能」，order 19；空状态、导入按钮、数据目录提示正常。
2. 通过 UI 导入真实 luban（https://code.comein.cn/ai/luban.git，ref pro）：
   `扫描到 68 个 SKILL.md，68 个可安装`，重名行显示「重名，默认改名为 …」；
   安装后 summary：`total=68, enabled=68, loaded=68, repos=1`，provider 注册名 `dsh-skills-tools`，rank 350。
3. 详情：git-workflow 展开显示来源、commit `f2a3899067be`、快照路径与 SKILL.md 原文。
4. 启停：停用 chart-gen 后 `enabled=false, loaded=false`，summary 变 67；再次打开恢复。
5. 批量：`全部停用` → `enabled=0, loaded=0`；`全部启用` → 全部恢复。
6. 新增：导入本机 fixture 目录（plugins/demo/skills/demo-skill），扫描 1 个、安装 1 个，summary 69；
   「全部停用」后 provider 候选为 0，恢复后 69。
7. 更新：修改 fixture 的 SKILL.md 后点击「从上游更新」，description 由
   `Demo skill for the E2E import flow` 变为 `Demo skill updated by E2E`，大小 116 → 110 字节。
8. 删除：移除 demo-skill 后 summary 回到 68、repos 1；fixture 的仓库记录与
   `repos/skills-fixture-local-*` 快照目录被立即删除，未留下孤儿目录。
9. 截图：
   - `docs/screenshots/skills-overview.png`：按仓库分组（仓库级开关、可导入标记）
   - `docs/screenshots/skill-content.png`：展开 SKILL.md 正文
   - `docs/screenshots/import-more.png`：补齐仓库剩余技能
   - `docs/screenshots/import-dialog.png`：导入技能对话框

## 4. 技能可触发性（只读）

在隔离 profile 的 agent 中，模型通过 `skill` 工具实际加载技能（read-only，未执行命令）：

- project-docs：提示「请调用 skill 工具加载技能 project-docs，只输出正文前两行」，
  返回「项目文档入口分发 / 统一入口，识别用户意图与项目类型，分发到对应子技能。」
- git-workflow：同一流程返回「# Git Workflow 完整流程 / 根据用户意图，调用对应技能完成操作。」，
  会话显示 1 轮 2 步、已完成。
- 停用后：把 git-workflow 与 project-docs 都停用（summary 66），新会话同样提示返回
  `UNAVAILABLE`（skill 工具已无法加载）；重新启用后再次触发，git-workflow 正常返回第一行。

结论：provider 的启用过滤真实作用于 DSH 技能目录，启停即时生效。

## 5. 发布

- npm：`dsh-skills-tools@1.0.0`，dist-tag `latest`（2026-11-03T13:01:57Z 发布）。
  `npm view dsh-skills-tools version` → `1.0.0`；registry 中另有 `0.0.0-stage` 占位版本（发布前用于锁定包名）。
- GitHub：https://github.com/hxlog/dsh-skills-tools ，tag `v1.0.0`，
  release：https://github.com/hxlog/dsh-skills-tools/releases/tag/v1.0.0
- dsh-go：npm run verify:dsh-go 通过
- 市场材料：docs/MARKETPLACES.md、docs/SUBMISSION-KIT.md
- 已知项：`.github/workflows/ci.yml` 因 gh token 缺少 `workflow` scope 暂未推送，待 `gh auth refresh -s workflow` 后补推。

## 6. 真实环境切换（最终步骤）

已完成（2026-11-03，DSH_HOME=C:\Users\Xingy\.dsh，desktop profile）：

1. 备份：`%TEMP%\luban-backup-20261103-210349.zip`（8.99 MB；含项目 `.dsh\skills` junction 清单、项目 `.dsh\luban`、`~/.dsh\luban`、web profile patch）。
2. 先在真实 DSH_HOME 预导入 luban：ref `pro`，commit `f2a38990`，68 个技能全部启用；`state.json` 校验 `repos=1 skills=68 enabled=68`。
3. desktop profile 安装并启用插件：`dsh plugin --profile desktop add dsh-skills-tools@1.0.0` 成功；`dependencies` 与 `dsh.profile.bundles` 均含 `dsh-skills-tools`；`profiles/desktop/node_modules/dsh-skills-tools/package.json` 版本 1.0.0。
4. 清理 luban：
   - 删除项目 `.dsh\skills` 下 67 个 junction（`junctions_removed=67`），随后删除空目录；
   - 删除项目 `.dsh\luban` 与 `~/.dsh\luban`（含 site、同步脚本、clone），`exists=False`；
   - 删除 web profile `cordis.patch.yml` 的 `luban-skills` insert 块（第 399–433 行），剩余 `luban` 引用 0 处。

待重启后验证（重启 DSH Desktop 会结束当前会话，故单独执行）：

- 设置 → 技能页出现 68 个技能且全部启用，provider 为 `dsh-skills-tools`；
- 触发 `project-docs` / `git-workflow` 返回技能首行（项目文档入口分发 / # Git Workflow 完整流程）；
- 关闭其中 1–2 个技能后触发返回 UNAVAILABLE，再重新启用恢复；
- 用插件 UI 新增本地技能、暂停/启用、删除，确认状态持久化。


## 7. v1.1 仓库分组（隔离环境 E2E）

环境：`DSH_HOME=%TEMP%\dsh-skills-e2e`，profile `skillsverify`，插件以 `file:` 方式安装；本地 fixture 仓库 `skm-aaa`（2 个技能）与 `skm-zzz`（3 个技能）。浏览器：Playwright，通过页面内 fetch 完成导入。

| 验收点 | 结果 |
| --- | --- |
| 分组渲染 | 2 个仓库卡片；`skm-aaa` 显示「共 2 个技能，已导入 1」+「可导入 1 个」；`skm-zzz` 显示 3/3 |
| 仓库排序 | 停用 `skm-aaa`、启用 `skm-zzz` 后顺序变为 `skm-zzz → skm-aaa`（启用优先） |
| 仓库开关 | 关闭 `skm-zzz` 后 3 个技能行全部 off、开关 `aria-checked=false`；再次开启恢复 |
| 半选状态 | `skm-aaa` 停用 1/2 后 `data-mixed=true`、`aria-checked=false` |
| 技能排序 | 组内 `alpha-two`（启用）排在 `alpha-one`（停用）之前 |
| chevron 展开 | 点击后详情面板出现，`SKILL.md` 正文以纯文本展示（含 frontmatter 与标题） |
| 导入更多 | 对话框列出 `alpha-one`（已导入、置灰）与 `alpha-two`（可勾选）；全选后「导入所选（1）」→ 提示「已导入 1 个技能」；仓库变为「共 2 个技能，已导入 2」 |
| 回归 | manager-test 17 组、provider-test 7 项、ci-check、smoke 全部通过 |

截图：`docs/screenshots/skills-overview.png`、`docs/screenshots/skill-content.png`、`docs/screenshots/import-more.png`、`docs/screenshots/import-dialog.png`。
