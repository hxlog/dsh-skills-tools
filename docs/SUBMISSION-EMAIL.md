# dshmarketplace.com 投稿邮件草稿

收件人：hello@dshmarketplace.com
主题：Listing request: dsh-skills-tools & dsh-mcp-tools (DeepSeek Harness plugins)

---

Hi dshmarketplace team,

I maintain two DeepSeek Harness plugins and would like to have them listed on dshmarketplace.com.

**1. dsh-skills-tools** — a Skills manager inside DeepSeek Harness Settings.
- Repository: https://github.com/hxlog/dsh-skills-tools
- npm: https://www.npmjs.com/package/dsh-skills-tools (1.1.1)
- Install: `dsh plugin add dsh-skills-tools`
- What it does: imports Agent Skills from Git repositories, groups them by repository, switches each skill on or off, and expands SKILL.md content in place. Disabled skills are never registered with the model, so it keeps context lean.
- Tags: `dsh-plugin`, `dsh-pack`, `deepseek-harness`, `skills`, `agent-skills`
- License: MIT, no telemetry; state is stored locally.

**2. dsh-mcp-tools** — an MCP server and tool manager inside DeepSeek Harness Settings.
- Repository: https://github.com/hxlog/dsh-mcp-tools
- npm: https://www.npmjs.com/package/dsh-mcp-tools
- Install: `dsh plugin add dsh-mcp-tools`
- What it does: adds streamable-HTTP or stdio MCP servers, lets you fill request headers Postman-style, tests connectivity before saving, and toggles individual tools so disabled tools never reach the model.
- Tags: `dsh-plugin`, `deepseek-harness`, `mcp`, `mcp-manager`

Both repos publish real code (ESM host plugin + browser client bundle), declare `dsh.bundle.patch` in package.json, and ship MIT-licensed source.

If you need a different format, a specific category, or a listing JSON shape, tell me and I will adjust the submission.

Thanks,
hxlog
