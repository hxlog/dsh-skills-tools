# HTTP API

所有接口都挂在 **/skills-tools/api** 下，只监听 DSH 自己的 Web 服务，并先经过 connection.requestRejection 的 Host/Origin/会话校验。请求与响应均为 JSON（UTF-8，cache-control: no-store）。

成功响应至少包含 ok: true；失败为 HTTP 4xx/5xx 或 200 + ok: false，结构：

    { "ok": false, "error": "人类可读的错误信息" }

请求体上限 256 KiB。未知方法返回 405。

## 读取

### GET /state

返回完整视图，供设置页首屏与轮询使用。

    {
      "ok": true,
      "version": 1,
      "skills": [{
        "name": "project-docs",
        "sourceName": "router",
        "renamed": true,
        "description": "项目文档入口分发…",
        "whenToUse": "当用户说…",
        "invocation": { "modelInvocable": true, "userInvocable": true },
        "enabled": true,
        "loaded": true,
        "exists": true,
        "lastError": null,
        "relPath": "project-docs/skills/router",
        "path": ".../repos/.../project-docs/skills/router",
        "files": 0,
        "bytes": 1234,
        "importedAt": 1730000000000,
        "updatedAt": 1730000000000,
        "repo": {
          "id": "repo_...",
          "url": "https://code.comein.cn/ai/luban.git",
          "kind": "git",
          "ref": "pro",
          "commit": "0123abcd…",
          "shortCommit": "0123abcd",
          "latestCommit": null,
          "updateAvailable": false,
          "checkedAt": 0,
          "lastError": null
        }
      }],
      "repos": [{ "id": "repo_…", "url": "…", "ref": "pro", "commit": "…", "skills": 68, "enabled": 68, "updateAvailable": false }],
      "summary": { "total": 68, "enabled": 68, "loaded": 68, "repos": 1 },
      "provider": { "name": "dsh-skills-tools", "registered": true, "rank": 350 },
      "paths": { "manager": "…", "repos": "…", "state": "…" },
      "events": [{ "at": 1730000000000, "level": "info", "skill": null, "message": "…" }]
    }

### GET /logs?limit=100

最近操作（环形缓冲，最多 300 条）。

### GET /skills/content?name=<skill>

返回 SKILL.md 原文（含 frontmatter），最多 64 KiB：

    { "ok": true, "name": "git-workflow", "path": "…/SKILL.md", "bytes": 8123, "truncated": false, "content": "---\nname: …" }

## 仓库分组（v1.1）

### POST /repos/inspect

请求：`{ "repoId": "repo_..." }`

扫描该仓库的本地快照，返回仓库内全部技能及导入状态：

```json
{
  "ok": true,
  "repo": { "id": "repo_...", "url": "...", "ref": "main", "shortCommit": "f2a38990", "skills": 3, "available": 5, "enabled": 2 },
  "imported": 3,
  "available": 5,
  "skills": [
    { "relPath": "plugins/a/skills/x", "name": "x", "suggestedName": "x", "description": "...", "valid": true, "imported": false, "enabled": false }
  ]
}
```

### POST /repos/import

请求：`{ "repoId": "repo_...", "skills": [{ "relPath": "plugins/a/skills/x", "name": "x" }] }`

从**现有快照**补充导入技能（不重新克隆）。返回：

```json
{ "ok": true, "installed": ["x"], "skipped": [{ "relPath": "...", "name": "...", "reason": "同名 skill 已存在（来自另一个仓库）..." }], "repo": "repo_...", "available": 5 }
```

### POST /repos/toggle

请求：`{ "repoId": "repo_...", "enabled": true }`

一次启用或停用该仓库下的全部技能，返回 `{ "ok": true, "changed": 3 }`。

`/state` 的 `repos[]` 新增 `available` 字段（已知时可导入技能总数，未知时为 null）。

## 导入

### POST /import/scan

    { "url": "https://code.comein.cn/ai/luban.git", "ref": "pro", "subdir": "" }

url 可以是 Git URL、本机绝对路径或 file:// URL。ref 为空时使用远端默认分支（HEAD）。扫描会克隆到 $DSH_HOME/dsh-skills-tools/tmp/scan-*，15 分钟内有效。

    {
      "ok": true,
      "scanId": "scan_ab12cd34ef56",
      "source": { "kind": "git", "url": "https://code.comein.cn/ai/luban.git", "ref": "pro", "subdir": "" },
      "commit": "0123abcd…",
      "ref": "pro",
      "skills": [{
        "relPath": "project-docs/skills/router",
        "name": "project-docs",
        "originalName": "router",
        "suggestedName": "project-docs",
        "duplicate": true,
        "description": "项目文档入口分发…",
        "invocation": { "modelInvocable": true, "userInvocable": true },
        "valid": true,
        "reason": "",
        "hidden": false
      }],
      "warnings": [],
      "truncated": false
    }

重名规则：按扫描顺序（目录名字典序）先到先得；后出现的重名技能默认改为 **插件目录-原名**（project-docs/generate → project-docs-generate），其中 router 约定为插件入口（project-docs/router → project-docs）。建议名称可在导入对话框中修改。

### POST /import/commit

    { "scanId": "scan_…", "skills": [{ "relPath": "git-workflow/skills/git-commit", "name": "git-commit" }] }

全部选中项成功写入后返回：

    { "ok": true, "installed": ["git-commit"], "skipped": [], "snapshot": "code.comein.cn-ai-luban.git-0123abcd", "commit": "0123abcd…" }

同一仓库再次导入是幂等的；同名但来自其他仓库的技能会被跳过（除非先移除）。

## 修改

### POST /skills/toggle

    { "name": "chart-gen", "enabled": false }

    { "ok": true, "skill": "chart-gen", "enabled": false }

启用/停用会调用 provider 的 control.invalidate()，DSH 下一步即可见。

### POST /skills/bulk

    { "action": "all" }   // all | none | invert

    { "ok": true, "changed": 3 }

### POST /skills/remove

    { "name": "chart-gen" }

    { "ok": true, "removed": "chart-gen" }

当仓库的最后一个技能被移除时，仓库记录与快照一并清理。

### POST /skills/update

    { "name": "git-commit" }

从上游重新克隆该技能所属仓库，生成新快照并切换，同时刷新该仓库所有技能的元数据。返回：

    { "ok": true, "skill": "git-commit", "repo": "repo_…", "commit": "…", "ref": "pro" }

### POST /repos/check-updates

对所有仓库执行 git ls-remote，写入 latestCommit / checkedAt / lastError，不修改技能内容。

    { "ok": true, "repos": [{ "id": "repo_…", "commit": "…", "latestCommit": "…" }] }

### POST /refresh

重新读取并解析快照中的 SKILL.md，修正描述、whenToUse、invocation 与 lastError。

    { "ok": true, "refreshed": 68 }

## 错误示例

    { "ok": false, "error": "Git 凭据不可用（需要该仓库的访问权限）。请先在本机完成 git 认证（credential helper / SSH key）后重试。" }
    { "ok": false, "error": "扫描结果已过期，请重新扫描仓库" }
    { "ok": false, "error": "同名 skill 已存在（来自另一个仓库），请先移除或改名" }
