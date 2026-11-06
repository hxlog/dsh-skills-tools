# dsh-skills-tools 1.2.0

1.2.0 新增 monorepo 子目录的**稀疏克隆**导入：像 `https://github.com/vercel/next.js/tree/canary/skills` 这样的大仓库，现在只拉取目标子目录，而不是整个仓库。

## 新功能

- **按子目录稀疏克隆（Git 来源）**：来源带 `subdir`（显式填写，或从 URL 的 `/tree/<ref>/<subdir>` 路径自动解析）时，改用

  ```bash
  git clone --depth 1 --no-tags --single-branch --filter=blob:none --sparse --branch <ref> -- <url> <dir>
  git -C <dir> sparse-checkout set --cone <subdir>
  ```

  只下载目标子树与仓库根级文件；工作区根目录仍是克隆根，因此技能的 `relPath` 保持 `skills/<name>` 形式，扫描与导入逻辑无需改变。
- **实测 vercel/next.js（约 2.6 GB 仓库）**：扫描 `canary/skills` 用时约 7 秒、快照约 2 MiB，全部 Next.js 技能可正常导入。
- **自动回退**：只要稀疏克隆任一步失败（旧版 git 不支持 `--sparse` / `--filter`、服务器不支持 partial clone、子目录不存在等），插件会删除半成品目录并回退到原有的全量浅克隆，导入行为与 1.1.1 完全一致，不新增错误。
- **commit-ref 支持**：提交 SHA 同样走稀疏路径：先浅克隆、设置稀疏，再 `git fetch --depth 1 origin <sha>` 与 `git checkout --detach FETCH_HEAD`。请使用完整 40 位 SHA；缩写 SHA 无法作为 ref 获取，会按回退处理。
- **URL 解析修复**：`/tree/<ref>/<subdir>` 现在同时支持 GitHub/Gitea（`host/owner/repo/tree/...`）与 GitLab（`host/group/project/-/tree/...`）形式。

## 内部变化

- `state.json` 的 `repos[]` 新增 `subdir` 字段（默认 `""`，旧 state.json 自动兼容）；`/state` 与 `/repos/inspect` 也会返回它。
- `commitImport` 记录来源子目录；仓库更新（`/skills/update`）与检查更新（`/repos/check-updates`）会带上该字段，从而复用稀疏克隆。
- 新增可选网络集成测试 `scripts/network-sparse-test.mjs`（需 `SKILLS_TOOLS_NETWORK=1`，不进 CI）与 `npm run test:network`；`npm test` 增加稀疏克隆的静态断言。

## 已知边界

- **一个仓库记录只保留一个快照和一个 `subdir`**。对同一 URL 用不同子目录再次导入会更新仓库的 `subdir` 并切换快照；之前从其他子目录导入的技能在仓库更新时可能提示「上游仓库中已不存在该 skill 路径」。
- 稀疏克隆使用 cone 模式，工作区会包含仓库根级文件，因此快照略大于纯子目录内容；这符合 git 的 cone 语义，且不影响技能扫描。
- 本机目录来源的 `subdir` 仍在扫描阶段过滤，不涉及克隆。

## 测试

- `npm test`（smoke）、`npm run test:manager`、`npm run test:provider`、`npm run ci-check` 全部通过。
- 可选网络测试：`SKILLS_TOOLS_NETWORK=1 npm run test:network`。
