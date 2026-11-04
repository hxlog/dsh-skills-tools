# 市场与分发材料

## 定位

一句话：**为 DeepSeek Harness 提供 Cursor 式的 Skills 管理器** —— 从任意 Git 仓库导入 Agent Skills，按需启用/停用，保留 SKILL.md 的相对资源引用。

目标用户：

- 已经有一批 Claude Code / Cursor / Codex 技能，希望在 DSH 中复用的人。
- 内网团队：技能放在 GitLab，靠本机 git 凭据拉取，不配置额外令牌。
- 需要按任务临时关闭部分技能、降低上下文噪音的高级用户。

## 卖点（用于商店描述）

1. **一条命令导入整个技能仓库**：支持 GitHub / GitLab / 内网 / 本机目录，支持分支、标签、提交与子目录。
2. **开关即时生效**：停用的技能不会进入模型上下文；DSH 技能目录自动失效重载。
3. **只读快照，不污染源仓库**：按提交复制，更新失败不影响现有可用状态。
4. **资源引用不破坏**：以目录为 resourceBase 注册，../../assets 与跨技能引用继续可用。
5. **重名自动消歧**：按插件目录重命名（project-docs/generate → project-docs-generate），router 归为插件入口。
6. **零依赖、无安装脚本**：宿主 ESM + 经典客户端脚本，审计简单。

## 截图

- docs/screenshots/skills-overview.png：设置 → 技能（按仓库分组、仓库级开关、可导入标记）
- docs/screenshots/skill-content.png：展开查看 SKILL.md 正文
- docs/screenshots/import-more.png：从仓库补齐剩余技能
- docs/screenshots/import-dialog.png：导入技能对话框

## 关键词

dsh, dsh-plugin, deepseek-harness, deepseek, skills, agent-skills, skill-manager, cursor, settings, git, intranet

## 分类

Developer Tools / AI Agents / Settings

## 文案模板（中文）

标题：DSH Skills Tools — Cursor 式技能管理器

正文：在设置中导入任意 Git 仓库的 Agent Skills，逐项启用或停用，检查上游更新并从快照恢复。停用的技能不会进入模型上下文；技能以只读快照保存，源仓库零改动。支持 GitHub、GitLab、公司内网与本机目录，复用本机 git 凭据。

## 文案模板（English）

Title: DSH Skills Tools — a Cursor-style skills manager for DeepSeek Harness

Body: Import Agent Skills from any Git repository, toggle each skill on or off, check upstream commits and switch snapshots. Disabled skills stay out of the model context. Repositories are kept as read-only snapshots, so your source tree is never modified. Works with GitHub, GitLab, intranet hosts and local folders using your existing git credentials.

## 提交状态（2026-11-04）

| 市场 | 方式 | 状态 | 链接 |
| --- | --- | --- | --- |
| vvlife/awesome-deepseek-harness-plugins | README 单行新增（Tools & Editor UX） | ✅ 已合并 | https://github.com/vvlife/awesome-deepseek-harness-plugins/pull/176 |
| jiji262/awesome-deepseek-harness | README 单行新增（Agent Skills） | 🟡 待审 | https://github.com/jiji262/awesome-deepseek-harness/pull/52 |
| imsai-sh/awesome-deepseek-harness-plugins（deepseek1024） | catalog JSON 单文件（category: skill） | 🟡 待审 | https://github.com/imsai-sh/awesome-deepseek-harness-plugins/pull/809 |
| awesome-dsh-plugin/awesome-dsh-plugin | `data/plugins/hxlog__dsh-skills-tools.yml` | 🟡 待审（仓库创建未满 24h，CI 可能要求重新提交） | https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/11849 |
| dsh-plugin.org（dshplugin/dsh-plugin-hub） | Issue 模板提交 | 🟡 待审 | https://github.com/dshplugin/dsh-plugin-hub/issues/616 |
| deepseek-harness Discussions（Show Your Plugins!） | 新建 Discussion | ✅ 已发布 | https://github.com/deepseek-ai/deepseek-harness/discussions/12094 |
| dshplugins.com | 网页表单 | ⚪ 需 Google 登录后提交 | https://dshplugins.com/submit |
| dshmarketplace.com | 邮件 hello@dshmarketplace.com | ⚪ 待发邮件 | https://dshmarketplace.com |
| dshplugin.app | 网页表单（含 captcha） | ⚪ 需人工过验证码 | https://dshplugin.app/submit |

自动收录：已发布 npm（`dsh-skills-tools`）并设置 `dsh-plugin`、`deepseek-harness` 等 GitHub topics，dsh.market、dsh.so、dsh-plugins.org、dsh-plugin-catalog、bradeGithub、LivXue、unStone、linny006、dshmk 等按 topic / npm 关键字自动抓取的目录会随下一次抓取生效。
