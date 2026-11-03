# dsh-skills-tools

把 Agent Skills 当作可管理的资产：从 Git 仓库（GitHub、GitLab、公司内网）或本机目录导入，在 **设置 → 技能** 中随时启用、停用、更新和移除，像 Cursor 管理 Skills 一样管理 DSH 的技能目录。

- 版本：**1.0.0** · 许可：MIT · 零依赖 · 宿主 ESM + 经典脚本客户端
- 设置入口：**设置 → 技能**（第 19 个分区，紧随 MCP 之后）

## 为什么需要它

Claude Code 用 **/skills** 菜单开关技能，Cursor 用 **.cursor/skills** 与插件市场分发技能，Codex 用 **skill-installer** 从 GitHub 拷贝技能目录。它们都提供「安装、查看、开关、更新、删除」这一套动作；DSH 原生的技能发现只负责扫描目录，不负责导入、快照和开关。

dsh-skills-tools 补上这一层：

1. **导入**：粘贴 Git URL（或本机目录），可指定分支、标签、提交和子目录，一次扫描全部 SKILL.md。
2. **启用 / 停用**：开关即时生效并让 DSH 技能目录失效重载；停用的技能不会进入模型上下文。
3. **只读快照**：仓库按提交复制到数据目录，原目录与远端永远不被修改；删除技能不会影响仓库。
4. **按内容寻址的更新**：检查上游最新提交，确认后再切换快照。
5. **资源完整**：技能以「目录 + resourceBase」注册，因此 ../../assets、../check/xxx 这类相对引用仍然可用。

## 安装

DSH 插件（任选其一）：

    # 已发布到 npm 后
    dsh plugin add dsh-skills-tools

    # 本地开发
    dsh plugin add file:D:/PythonProjects/dsh-skills-tools

也可以把插件行加进 profile 的 cordis.patch.yml：

    - insert:
        - id: skills-tools
          name: dsh-skills-tools

安装后重启 DSH，打开 **设置 → 技能**。

## 使用

### 导入技能

1. 点击右上角 **导入技能**。
2. 填写 **仓库 URL 或本机目录**，例如 https://code.comein.cn/ai/luban.git 或 D:/work/my-skills。
3. 可选：填写分支 / 标签 / 提交（例如 pro），或子目录（例如 skills）缩小扫描范围。
4. 点击 **扫描**，勾选要安装的技能；重名项会自动给出建议名称（可修改）。
5. 点击 **安装选中**。安装即启用。

支持的地址形式：

- https://host/owner/repo、https://host/owner/repo.git
- https://host/owner/repo/tree/<ref>/<subdir>（GitHub 风格）
- git@host:owner/repo.git（SSH）
- file:///path/to/repo
- 本机绝对路径（会复制快照，不修改原目录）

### 启用、停用与批量操作

- 行首开关：即时启用或停用单个技能。
- 工具栏：全部启用、全部停用。
- 搜索：按名称、描述、路径或仓库过滤；筛选：全部 / 已启用 / 已停用。
- 展开行：查看 SKILL.md 原文、来源、提交、快照路径，执行「从上游更新」「移除」「复制路径」。

### 更新与移除

- **检查更新**：对每个仓库执行 git ls-remote，标记有新提交的技能。
- **从上游更新**：重新克隆并生成新快照；快照只在成功后切换，失败不会破坏现有可用状态。
- **移除**：从技能库删除；当仓库的最后一个技能被移除时，旧快照会被清理。

## 内网与私有仓库

插件不保存任何令牌，直接复用本机 git 凭据：

- HTTPS：系统 credential helper 已缓存的账号或令牌；
- SSH：本机 SSH key / agent。

克隆时设置 GIT_TERMINAL_PROMPT=0，凭据缺失会立即失败并提示，不会卡住设置页。

## 架构

    Git 仓库 / 本机目录
          │ git clone --depth 1 --single-branch (或直接读取)
          ▼
    $DSH_HOME/dsh-skills-tools/repos/<slug>-<commit>   只读快照
          │ 扫描 SKILL.md（跳过 .git、符号链接；深度与文件数有上限）
          ▼
    $DSH_HOME/dsh-skills-tools/state.json              仓库 + 技能 + enabled
          │ ctx.skills.registerProvider(rank 350)
          ▼
    DSH 技能目录（仅 enabled 且文件存在的技能）

- provider 名称：dsh-skills-tools，rank 350（低于项目级 100/200，高于用户级 400/500，因此同名时项目技能优先，管理器技能优先于用户目录技能）。
- 每个技能以 resourceBase = { kind: "directory", path: <快照>/<技能目录> } 注册，所以 SKILL.md 里的相对资源引用可用。
- 状态读取带 mtime 记忆；跨进程写入使用目录锁 + 临时文件原子替换，多个 DSH 窗口共享同一份状态。
- 前端只做展示与调用，不直接读写文件。

## 数据目录

    $DSH_HOME/dsh-skills-tools/
      state.json        技能与仓库状态
      logs.jsonl        最近操作日志（环形缓冲 300 条）
      repos/            只读快照
      tmp/              扫描与更新的临时克隆（自动清理）
      state.lock        写入锁（瞬时）

DSH_HOME 默认为 ~/.dsh（Windows 为 %USERPROFILE%\.dsh）。

## 安全

- 所有管理接口位于 /skills-tools/api，先经过 DSH connection.requestRejection 的 Host/Origin/会话校验，其他本地进程无法直接驱动。
- 请求体上限 256 KiB；快照上限 20000 文件 / 300 MiB；单文件 SKILL.md 上限 2 MiB。
- 快照不跟随符号链接，路径必须落在快照目录内；删除操作校验目标位于 repos 之下。
- 技能内容按原样呈现，不执行仓库中的脚本；git 命令以参数数组启动，不经过 shell。
- 不写入仓库，不修改 SKILL.md，不调用远端 API（只有 git 传输本身）。

## HTTP API

前缀 /skills-tools/api，全部返回 JSON；失败为 { "ok": false, "error": "..." }。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /state | 技能、仓库、统计、事件、数据目录 |
| GET | /logs?limit=100 | 最近操作 |
| POST | /import/scan | { url, ref?, subdir? } 克隆并扫描 |
| POST | /import/commit | { scanId, skills: [{ relPath, name }] } 安装 |
| POST | /skills/toggle | { name, enabled } |
| POST | /skills/bulk | { action: all / none / invert } |
| POST | /skills/remove | { name } |
| POST | /skills/update | { name } 从上游更新所属仓库 |
| POST | /repos/check-updates | 检查所有仓库最新提交 |
| POST | /refresh | 重新解析本地 SKILL.md |
| GET | /skills/content?name= | SKILL.md 原文（上限 64 KiB） |

详见 docs/API.md。

## 开发

    npm test              # 离线 smoke：frontmatter、manager、provider、客户端 bundle
    npm run test:manager  # 管理流程集成测试（临时 DSH_HOME + 本地 fixture 仓库）
    npm run ci-check      # manifest / patch / ESM / 客户端 / i18n 契约检查
    node scripts/build-client.mjs   # 修改 client/ui.css 后重新内联

客户端源码为 client/client.src.js + client/ui.css，构建产物是 client/client.js（内联 CSS、经典脚本、无模块语法）。CI 会校验产物可被 vm.Script 解析。

## 与原生技能的关系

- 原生发现（dsh-skill-filesystem）继续工作；本项目只是额外的 provider。
- 同名时按 rank 竞争：项目级技能（100/200）优先于本 provider（350），本 provider 优先于用户目录（400/500）。
- 停用只影响本 provider 注册的技能，不会移动或修改原生目录中的文件。

## 已知限制

- 同名技能的最终名称由导入时决定；DSH 注册表以 name 去重，同名冲突需要在导入对话框里改名。
- 一个仓库只跟踪一个 ref；需要多分支并存时，请分别以不同子目录或不同仓库导入。
- 快照是完整仓库副本；超大 monorepo 请用子目录扫描并在导入前确认体量。

## License

MIT © 2026 Xingyu Liu
