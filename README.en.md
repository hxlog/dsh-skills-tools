# dsh-skills-tools

Manage Agent Skills as assets: import them from a Git repository (GitHub, GitLab or your intranet) or a local folder, then enable, disable, update and remove them in **Settings → Skills** — the Cursor-like workflow for the DSH skill catalog.

- Version **1.0.0**, MIT, zero dependencies, ESM host + classic-script client
- Settings section **Skills** (order 19, right after MCP)

## Why

Claude Code ships a **/skills** menu with on/off overrides, Cursor discovers .cursor/skills and plugin marketplaces, and Codex uses skill-installer to copy skills from GitHub. DSH native discovery scans directories but does not import, snapshot or toggle them.

dsh-skills-tools fills that gap:

1. **Import** from a Git URL (or local folder), optionally pinned to a branch, tag, commit or subdirectory.
2. **Enable / disable** instantly; the DSH catalog is invalidated and disabled skills never reach the model context.
3. **Read-only snapshots**: each repository is copied by commit into the data folder; the source is never modified.
4. **Content-addressed updates**: check the remote head, then switch snapshots only after a successful clone.
5. **Resources keep working**: skills register with resourceBase = { kind: "directory", path: snapshot/skill }, so ../../assets and ../check/... references resolve.

## Install

    dsh plugin add dsh-skills-tools
    # or from a checkout
    dsh plugin add file:D:/PythonProjects/dsh-skills-tools

Add the bundle row to a profile's cordis.patch.yml if you prefer:

    - insert:
        - id: skills-tools
          name: dsh-skills-tools

Restart DSH, then open **Settings → Skills**.

## Usage

1. **Import skills** → paste a repository URL or local path.
2. Optionally pin a ref (branch / tag / commit) or a subdirectory.
3. **Scan**, select skills (duplicate names get an editable suggestion), then **Install selected**.
4. Toggle rows on/off, search and filter, expand a row to read SKILL.md or update/remove it.
5. **Check updates** marks skills whose repository has a newer commit; **Update from upstream** clones and switches the snapshot.

Supported sources: https://host/owner/repo(.git), GitHub-style /tree/<ref>/<subdir>, git@host:owner/repo.git, file:///path, and absolute local paths.

## Intranet and private repositories

No token is stored. The plugin reuses your local git credentials (credential helper or SSH agent) and sets GIT_TERMINAL_PROMPT=0 so a missing credential fails fast instead of hanging.

## Architecture

    Git repo / local folder
      → clone --depth 1 --single-branch (or direct read)
      → $DSH_HOME/dsh-skills-tools/repos/<slug>-<commit>   read-only snapshot
      → scan SKILL.md (skips .git and symlinks, bounded depth/files)
      → $DSH_HOME/dsh-skills-tools/state.json              repos + skills + enabled
      → ctx.skills.registerProvider(rank 350)
      → DSH catalog (enabled skills with an existing SKILL.md only)

Ranks: project-dsh 100, project-agents 200, **dsh-skills-tools 350**, user-dsh 400, user-agents 500, bundled 600.

State writes use a directory lock plus atomic rename; the provider memoizes by state.json mtime, so several DSH windows share one library.

## Security

- Every route is gated by DSH connection.requestRejection (Host/Origin/session); other local processes cannot drive the library.
- 256 KiB request body cap, 20000 files / 300 MiB snapshot cap, 2 MiB SKILL.md cap.
- Snapshots never follow symlinks; paths are verified to stay inside the snapshot; removal is verified to stay inside repos/.
- Repository scripts are never executed; git runs with an argv array, never through a shell.

## Development

    npm test
    npm run test:manager
    npm run ci-check
    node scripts/build-client.mjs

Client source: client/client.src.js + client/ui.css → built into client/client.js (inlined CSS, classic script).

## License

MIT © 2026 Xingyu Liu
