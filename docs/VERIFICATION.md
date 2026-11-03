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
   - `docs/screenshots/skills-empty.png`：空状态
   - `docs/screenshots/import-scan.png`：导入扫描（68 项、重名提示）
   - `docs/screenshots/skills-list.png`：68 项列表与开关
   - `docs/screenshots/skill-detail.png`：展开详情（SKILL.md 原文）

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

- npm：dsh-skills-tools@1.0.0（latest）
- GitHub：hxlog/dsh-skills-tools，tag v1.0.0，release notes 与 docs/release-notes-v1.0.0.md 一致
- dsh-go：npm run verify:dsh-go 通过
- 市场材料：docs/MARKETPLACES.md、docs/SUBMISSION-KIT.md

结果：发布完成后在此补 npm / GitHub 链接与 `npm view dsh-skills-tools version` 输出。

## 6. 真实环境切换（最终步骤）

1. 备份：%TEMP%\luban-backup-<timestamp>.zip（项目 .dsh/skills、项目 .dsh/luban、~/.dsh/luban、web profile patch）。
2. 删除项目 .dsh/skills 的 junction 与 Deepseek_harness/.dsh/luban。
3. 删除 ~/.dsh/luban 与 web profile 中的 luban-skills patch 行。
4. 在 desktop profile 安装插件并启用 bundle，重启 DSH Desktop。
5. 导入 luban（ref pro），确认 68 个技能全部启用、DSH 已加载。
6. 触发 git-workflow / project-docs 验证。

结果：切换完成后在此补清理清单、最终 summary 与触发记录。
