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
