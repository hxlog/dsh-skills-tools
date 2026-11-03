// lib/provider.js — the ctx.skills provider backed by the managed snapshots.
// Only enabled skills are listed; enable/disable is therefore a pure state
// change (no SKILL.md rewrite, no directory moves).
import path from 'node:path'

export const PROVIDER_NAME = 'dsh-skills-tools'
export const PROVIDER_RANK = 350
export const PROVIDER_SOURCE = 'dsh-skills-tools'

export class SkillsProvider {
  constructor(manager) {
    this.manager = manager
    this.name = PROVIDER_NAME
  }

  list(options) {
    return this.manager.providerCandidates(options)
  }

  get(candidate, options) {
    return this.manager.providerDefinition(candidate, options)
  }
}

export function skillFilePath(manager, skill) {
  const repo = manager.repoById(skill.repoId)
  if (!repo || !repo.snapshot) return null
  const dir = path.join(manager.reposRoot(), repo.snapshot, skill.relPath.split('/').join(path.sep))
  return { dir: dir, file: path.join(dir, 'SKILL.md') }
}
