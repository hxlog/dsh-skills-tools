# dsh-skills-tools 1.0.0

首个公开版本：为 DeepSeek Harness 提供 Cursor 式的 Skills 管理器。

## 新功能

- 设置 → 技能（order 19）：列表、搜索、全部/已启用/已停用筛选、单开关与批量启停。
- 从 Git 仓库或本机目录导入：支持分支、标签、提交、子目录；内网仓库复用本机 git 凭据。
- 只读快照：按 commit 复制，更新失败不破坏现有状态；移除最后一个技能时清理快照。
- 重名自动消歧：插件目录前缀 + router 归为插件入口（project-docs/router → project-docs）。
- 展开详情：SKILL.md 原文、来源、提交、快照路径，支持从上游更新、移除、复制路径。
- 检查更新：git ls-remote 标记有新提交的技能。
- provider 名称 dsh-skills-tools，rank 350：项目技能优先，管理器技能优先于用户目录技能。
- 零依赖，无安装脚本；客户端为经典脚本，CSS 内联。

## 验证

- 离线 smoke、manager 集成测试、ci-check 全部通过。
- luban 仓库（https://code.comein.cn/ai/luban.git，ref pro）扫描 68 个技能，名称与现有 catalog 一致。
- 隔离 profile E2E：导入、启停、更新、删除、触发 git-workflow 与 project-docs。
