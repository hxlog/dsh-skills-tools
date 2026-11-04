<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/hxlog/dsh-skills-tools@main/docs/logo.png" width="72" height="72" alt="dsh-skills-tools" />
</p>

<h1 align="center">dsh-skills-tools</h1>

<p align="center">
  <b>DeepSeek Harness 的 Skills 管理器。</b><br />
  从 Git 仓库或本机目录导入 Agent Skills，按仓库分组管理，随时启用、停用、补齐和查看内容。
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-skills-tools"><img src="https://img.shields.io/npm/v/dsh-skills-tools?color=black" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/dsh-skills-tools"><img src="https://img.shields.io/npm/dm/dsh-skills-tools?color=black" alt="npm downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-black.svg" alt="license" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22.13-black.svg" alt="node" /></a>
  <a href="https://github.com/hxlog/dsh-skills-tools"><img src="https://img.shields.io/badge/GitHub-hxlog%2Fdsh--skills--tools-black?logo=github" alt="GitHub" /></a>
</p>

<p align="center">
  <a href="https://github.com/hxlog/dsh-skills-tools">GitHub 仓库</a> ·
  <a href="https://www.npmjs.com/package/dsh-skills-tools">npm</a> ·
  <a href="https://github.com/hxlog/dsh-skills-tools/issues">问题反馈</a> ·
  <a href="README.en.md">English</a>
</p>

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/hxlog/dsh-skills-tools@main/docs/screenshots/skills-overview.png" width="49%" alt="按仓库分组的技能列表" />
  <img src="https://cdn.jsdelivr.net/gh/hxlog/dsh-skills-tools@main/docs/screenshots/skill-content.png" width="49%" alt="展开查看 SKILL.md 内容" />
</p>

> 停用的技能不会注册进模型：不占上下文，也无法被误调用。

## ✨ 功能

| 能力 | 说明 |
| --- | --- |
| **按仓库分组** | 技能按来源仓库聚合为可折叠的仓库卡片；有启用技能的仓库优先，仓库内已启用的技能优先。 |
| **部分导入补齐** | 只导入了部分技能的仓库显示「可导入 N 个」，点「导入更多」从现有快照里勾选剩余技能，不重新克隆。 |
| **仓库级开关** | 一键启用或停用整个仓库；部分启用时开关显示半选状态。 |
| **展开查看内容** | 行右侧箭头展开 SKILL.md 正文、来源仓库、提交、路径与更新时间，也可就地更新或移除。 |
| **Git 导入与快照** | 支持 https / ssh / 内网仓库、分支 / 标签 / 提交与子目录；导入的是只读快照，原目录和远端不会被修改。 |
| **检查更新** | 对比上游最新提交，确认后再切换快照；多个仓库可一次检查。 |

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/hxlog/dsh-skills-tools@main/docs/screenshots/import-more.png" width="49%" alt="从仓库补齐剩余技能" />
  <img src="https://cdn.jsdelivr.net/gh/hxlog/dsh-skills-tools@main/docs/screenshots/import-dialog.png" width="49%" alt="导入技能" />
</p>

## 🚀 安装

需要 **DeepSeek Harness 0.2.x**（Web GUI `dsh web` 或 DSH Desktop）与 **Node.js ≥ 22.13**，包已发布到 npm：[dsh-skills-tools](https://www.npmjs.com/package/dsh-skills-tools)。

> ⚠️ 这是一个 **DeepSeek Harness 插件**，不是普通 npm 依赖库：`npm i dsh-skills-tools` 只会下载包，运行时仍需装进 DSH profile。

**通过插件页安装（推荐）**

1. 打开 DSH Web（或 DSH Desktop）→ 侧边栏 **插件**（Desktop 在 **设置 → 插件**）。
2. 点击安装，填入 `dsh-skills-tools`，确认。
3. 启用新 bundle，刷新页面，打开 **设置 → 技能**。

**通过命令行安装**

```bash
dsh plugin add dsh-skills-tools                    # 默认 profile
dsh plugin --profile web add dsh-skills-tools      # Web
dsh plugin --profile desktop add dsh-skills-tools  # Desktop
```

当前版本 **1.1.1**：按仓库分组、仓库级开关、从快照补齐剩余技能，插件名与图标和设置页一致。

> 升级包版本后需要重启 `dsh web` / 重启 DSH Desktop。
>
> `dsh plugin add` 只负责把包装进 profile，**不会自动启用 bundle**：装完请在插件页启用一次，或确认 profile 的 `dsh.profile.bundles` 已包含 `dsh-skills-tools`。

## ⚡ 快速开始

1. **设置 → 技能 → 导入技能**：粘贴 Git 地址（支持 `https://`、`git@`、`file://` 与本机绝对路径），内网仓库直接使用本机 git 凭据。
2. 可选填**分支 / 标签 / 提交**与**子目录**，点 **扫描**；勾选要安装的技能，重名项会给出可修改的建议名称，点 **安装选中**。安装即启用。
3. 回到列表按仓库管理：仓库开关批量启停，行开关控制单个技能，「导入更多」补齐同仓库剩余技能，点右侧箭头查看正文。

## 🧩 工作原理

```
~/.dsh/dsh-skills-tools/
├── state.json                 仓库、技能、启用状态与检查时间
└── repos/<仓库>-<提交>/        只读快照
```

- **快照隔离**：每次导入或更新把仓库复制到数据目录，删除技能只删状态，不影响仓库与快照。
- **注册即生效**：启用状态决定技能是否注册进 DSH 技能目录；停用即从模型上下文移除。
- **REST 接口**：`GET /skills-tools/api/state`、`POST /import/scan|commit`、`POST /repos/inspect|import|toggle|check-updates`、`POST /skills/toggle|bulk|remove|update`、`POST /refresh`、`GET /logs`；详见 [docs/API.md](docs/API.md)。

## 🔒 安全说明

- **不保存令牌**：Git 认证交给本机 credential helper 或 SSH key，插件只调用 `git`。
- **只读快照**：导入与更新都写入数据目录，你的仓库目录与远端不会被修改。
- **无遥测**：除你填写的仓库地址外不发起任何网络请求。

## 📋 前置要求与权限边界

- **运行环境**：DeepSeek Harness 0.2.x（Web `dsh web` 或 DSH Desktop），**Node.js ≥ 22.13**
- **支持平台**：DSH Web（`--profile web`）、DSH Desktop（`--profile desktop`）
- **文件访问**：读写插件数据目录 `~/.dsh/dsh-skills-tools/`；导入本机目录时只读取该目录
- **网络**：仅在导入、检查更新时访问你填写的 Git 仓库
- **进程**：导入 / 检查更新时调用本机 `git`
- **UI 注入**：设置页「设置 → 技能」面板，依赖 `@deepseek-ai/dsh-client-ui-settings` 与 `@deepseek-ai/dsh-client-locale`

**已知限制**

- 只管理当前 DSH profile 的技能，切换 profile 需重新导入
- Git 来源需要本机安装 `git`；内网仓库需要事先配置好凭据
- 技能内容预览最多 64 KiB，超出部分以省略号截断

## ❓ 常见问题

| 问题 | 处理 |
| --- | --- |
| 设置里没有「技能」分区 | 多半是 bundle 未启用：插件页确认并刷新，必要时重启 `dsh web`。 |
| 导入失败 | 内网仓库先在本机完成 git 认证；确认分支 / 子目录填写正确、仓库中存在 SKILL.md。 |
| 停用后模型还能调用吗 | 不能。停用的技能不会出现在模型工具列表中。 |
| 数据文件在哪 | `~/.dsh/dsh-skills-tools/state.json`；删除即重置，下次启动自动重建。 |

## 🛠 开发

```bash
git clone https://github.com/hxlog/dsh-skills-tools.git
cd dsh-skills-tools
node scripts/build-client.mjs   # 构建 client/client.js
npm test                        # 静态检查
npm run test:manager            # 离线 manager 集成测试
```

## 📄 License

[MIT](LICENSE) · Powered by [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
