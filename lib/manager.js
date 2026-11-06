// lib/manager.js — the skills library state machine.
// Owns import/scan/update/remove/toggle, the snapshot store and the provider
// data. All mutations go through state.json under a cross-process lock.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { parseSkillText } from './frontmatter.js'
import { cloneSource, remoteHead, resolveSource, sourceSlug } from './git.js'
import { SkillsProvider, PROVIDER_NAME, PROVIDER_RANK, PROVIDER_SOURCE, skillFilePath } from './provider.js'
import { describeScan, scanSkills } from './scan.js'
import { cleanTmpDirs, createSnapshot, removeSnapshot, snapshotDir } from './snapshot.js'
import { loadState, saveState, stateMtime } from './state.js'
import {
  createEventLog, ensureDir, errorText, managerDir, mapLimit, newId, reposDir, statePath, tmpDir, withLock
} from './util.js'

const SCAN_TTL_MS = 15 * 60 * 1000
const REPO_SCAN_TTL_MS = 60 * 1000
const MAX_IMPORT_SKILLS = 500
const MAX_CONTENT_BYTES = 64 * 1024

export class SkillManager {
  constructor(ctx, config) {
    this.ctx = ctx || null
    this.config = config || {}
    this.log = createEventLog(300)
    this.scans = new Map()
    this.repoScans = new Map()
    this.control = null
    this.providerRegistered = false
    this.providerDispose = null
    this.missing = new Set()
    this.memo = null
    this.ready = this.init()
    const self = this
    this.cleanupTimer = setInterval(function () { self.cleanupScans() }, 5 * 60 * 1000)
    if (this.cleanupTimer.unref) this.cleanupTimer.unref()
  }

  async init() {
    ensureDir()
    cleanTmpDirs(managerDir())
    const state = loadState()
    this.cleanupOrphanSnapshots(state)
    this.log.push('info', null, '技能库已就绪：' + String(state.skills.length) + ' 个技能')
    return this.views()
  }

  dispose() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer)
    if (typeof this.providerDispose === 'function') {
      try { this.providerDispose() } catch (error) {}
    }
    this.providerRegistered = false
    this.cleanupScans()
  }

  reposRoot() { return reposDir() }
  stateFile() { return statePath() }
  managerDir() { return managerDir() }

  attachSkills(skillsCtx) {
    if (!skillsCtx || !skillsCtx.skills || typeof skillsCtx.skills.registerProvider !== 'function') {
      this.log.push('warn', null, 'skills 服务不可用，技能不会注册到 DSH')
      return false
    }
    const self = this
    try {
      this.providerDispose = skillsCtx.skills.registerProvider(function (control) {
        self.control = control
        return new SkillsProvider(self)
      })
      this.providerRegistered = true
      this.log.push('info', null, '已注册 skill provider "' + PROVIDER_NAME + '"')
      return true
    } catch (error) {
      this.providerRegistered = false
      this.log.push('error', null, '注册 skill provider 失败：' + errorText(error))
      return false
    }
  }

  invalidate() {
    if (this.control && typeof this.control.invalidate === 'function') {
      try { this.control.invalidate() } catch (error) {}
    }
  }

  repoById(id) {
    return this.loadCachedState().repos.find(function (repo) { return repo.id === id }) || null
  }

  loadCachedState(force) {
    const mtime = stateMtime()
    const now = Date.now()
    if (!force && this.memo && this.memo.mtime === mtime && now - this.memo.at < 800) return this.memo.state
    const state = loadState()
    this.memo = { mtime: mtime, at: now, state: state }
    return state
  }

  resetMemo() { this.memo = null }

  resolveSkill(state, skill) {
    const repo = state.repos.find(function (item) { return item.id === skill.repoId })
    if (!repo || !repo.snapshot) return null
    const dir = path.join(reposDir(), repo.snapshot, skill.relPath.split('/').join(path.sep))
    const file = path.join(dir, 'SKILL.md')
    return { repo: repo, dir: dir, file: file, exists: fs.existsSync(file) }
  }

  views() {
    const state = this.loadCachedState(true)
    const repoById = new Map()
    for (const repo of state.repos) repoById.set(repo.id, repo)
    const skills = state.skills.map(function (skill) {
      const repo = repoById.get(skill.repoId) || null
      let resolved = null
      let exists = false
      if (repo && repo.snapshot) {
        resolved = path.join(reposDir(), repo.snapshot, skill.relPath.split('/').join(path.sep))
        exists = fs.existsSync(path.join(resolved, 'SKILL.md'))
      }
      return {
        name: skill.name,
        sourceName: skill.sourceName || skill.name,
        renamed: !!(skill.sourceName && skill.sourceName !== skill.name),
        description: skill.description,
        whenToUse: skill.whenToUse || null,
        invocation: skill.invocation,
        enabled: skill.enabled,
        loaded: skill.enabled && exists,
        exists: exists,
        lastError: exists ? null : 'SKILL.md 不在快照中（可能被更新移除）',
        relPath: skill.relPath,
        path: resolved,
        files: skill.files,
        bytes: skill.bytes,
        importedAt: skill.importedAt,
        updatedAt: skill.updatedAt,
        repo: repo ? {
          id: repo.id,
          url: repo.url,
          kind: repo.kind,
          ref: repo.ref,
          commit: repo.commit,
          shortCommit: repo.commit ? String(repo.commit).slice(0, 8) : null,
          latestCommit: repo.latestCommit,
          updateAvailable: !!(repo.latestCommit && repo.commit && repo.latestCommit !== repo.commit),
          checkedAt: repo.checkedAt,
          lastError: repo.lastError
        } : null
      }
    }).sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0 })

    const repos = state.repos.map(function (repo) {
      const owned = state.skills.filter(function (skill) { return skill.repoId === repo.id })
      return {
        id: repo.id,
        url: repo.url,
        kind: repo.kind,
        ref: repo.ref,
        subdir: repo.subdir || '',
        commit: repo.commit,
        shortCommit: repo.commit ? String(repo.commit).slice(0, 8) : null,
        latestCommit: repo.latestCommit,
        updateAvailable: !!(repo.latestCommit && repo.commit && repo.latestCommit !== repo.commit),
        checkedAt: repo.checkedAt,
        lastError: repo.lastError,
        snapshot: repo.snapshot,
        files: repo.files,
        bytes: repo.bytes,
        createdAt: repo.createdAt,
        updatedAt: repo.updatedAt,
        skills: owned.length,
        enabled: owned.filter(function (skill) { return skill.enabled }).length,
        available: repo.available || null
      }
    }).sort(function (a, b) { return a.url < b.url ? -1 : a.url > b.url ? 1 : 0 })

    const enabled = skills.filter(function (skill) { return skill.enabled }).length
    const loaded = skills.filter(function (skill) { return skill.loaded }).length
    return {
      ok: true,
      version: 1,
      skills: skills,
      repos: repos,
      summary: { total: skills.length, enabled: enabled, loaded: loaded, repos: repos.length },
      provider: { name: PROVIDER_NAME, registered: this.providerRegistered, rank: PROVIDER_RANK },
      paths: { manager: managerDir(), repos: reposDir(), state: statePath() },
      events: this.log.list(80)
    }
  }

  events(limit) { return this.log.list(limit) }

  async scanSource(input) {
    const source = resolveSource(input || {})
    this.cleanupScans()
    const temp = source.kind !== 'local'
    const dir = temp ? path.join(tmpDir(), 'scan-' + newId('scan')) : source.localPath
    if (temp) await fsp.mkdir(dir, { recursive: true })
    try {
      const cloned = await cloneSource(source, dir)
      const scanRoot = cloned.dir || dir
      const scanned = await scanSkills(scanRoot)
      let records = scanned.records
      if (source.subdir) {
        const prefix = source.subdir.replace(/^\/+|\/+$/g, '') + '/'
        records = records.filter(function (record) {
          return record.relPath === source.subdir || record.relPath.startsWith(prefix)
        })
      }
      const described = describeScan(records)
      const warnings = []
      if (scanned.truncated) warnings.push('仓库文件过多，扫描已在上限处停止')
      if (described.length === 0) warnings.push('没有找到任何 SKILL.md')
      if (described.length > MAX_IMPORT_SKILLS) {
        warnings.push('只返回前 ' + String(MAX_IMPORT_SKILLS) + ' 个 skill，请用子目录缩小范围')
      }
      const limited = described.slice(0, MAX_IMPORT_SKILLS)
      const scanId = newId('scan_')
      this.scans.set(scanId, {
        id: scanId,
        createdAt: Date.now(),
        temp: temp,
        dir: scanRoot,
        source: source,
        commit: cloned.commit || null,
        ref: cloned.ref || source.ref || 'HEAD',
        records: records.slice(0, MAX_IMPORT_SKILLS),
        total: described.length,
        importable: described.filter(function (item) { return item.valid }).length
      })
      this.log.push('info', null, '扫描 ' + source.url + '：发现 ' + String(described.length) + ' 个 skill')
      return {
        ok: true,
        scanId: scanId,
        source: { kind: source.kind, url: source.kind === 'local' ? source.localPath : source.url, ref: source.ref || '', subdir: source.subdir || '' },
        commit: cloned.commit || null,
        ref: cloned.ref || source.ref || 'HEAD',
        skills: limited,
        warnings: warnings,
        truncated: scanned.truncated
      }
    } catch (error) {
      if (temp) { try { await fsp.rm(dir, { recursive: true, force: true }) } catch (ignored) {} }
      throw error
    }
  }

  cleanupScans() {
    const now = Date.now()
    for (const [id, scan] of this.scans) {
      if (now - scan.createdAt < SCAN_TTL_MS) continue
      if (scan.temp) { try { fs.rmSync(scan.dir, { recursive: true, force: true }) } catch (error) {} }
      this.scans.delete(id)
    }
  }

  async commitImport(body) {
    const scanId = String(body && body.scanId || '')
    const scan = this.scans.get(scanId)
    if (!scan) throw new Error('扫描结果已过期，请重新扫描仓库')
    const wanted = Array.isArray(body && body.skills) ? body.skills : []
    if (wanted.length === 0) throw new Error('请至少选择一个 skill')
    const byRel = new Map()
    for (const record of scan.records) byRel.set(record.relPath, record)
    const selected = []
    const rejected = []
    for (const item of wanted) {
      const rel = String((item && item.relPath) || '')
      const record = byRel.get(rel)
      if (!record) { rejected.push({ relPath: rel, reason: '不在本次扫描结果中' }); continue }
      if (!record.parsed.ok) { rejected.push({ relPath: rel, name: '', reason: record.parsed.error }); continue }
      selected.push({ relPath: rel, record: record, requested: String((item && item.name) || '').trim() })
    }
    if (selected.length === 0) throw new Error('没有可安装的 skill：' + rejected.map(function (item) { return item.reason }).join('；'))

    return await withLock(path.join(managerDir(), 'state.lock'), async () => {
      const state = loadState()
      const slug = sourceSlug(scan.source)
      const repoId = 'repo_' + slug
      const snapshot = await createSnapshot(scan.dir, slug, scan.commit)
      let repo = state.repos.find(function (item) { return item.url === scan.source.url && item.id === repoId })
      if (!repo) {
        repo = state.repos.find(function (item) { return item.url === scan.source.url })
      }
      if (!repo) {
        repo = {
          id: repoId,
          url: scan.source.url,
          kind: scan.source.kind,
          ref: scan.ref || scan.source.ref || 'HEAD',
          subdir: scan.source.subdir || '',
          commit: scan.commit || null,
          snapshot: snapshot.rel,
          files: snapshot.files,
          bytes: snapshot.bytes,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          checkedAt: 0,
          latestCommit: null,
          lastError: null
        }
        state.repos.push(repo)
      } else {
        repo.ref = scan.ref || repo.ref
        if (scan.source.subdir && scan.source.subdir !== repo.subdir) repo.subdir = scan.source.subdir
        repo.commit = scan.commit || repo.commit
        repo.snapshot = snapshot.rel
        repo.files = snapshot.files
        repo.bytes = snapshot.bytes
        repo.updatedAt = Date.now()
        repo.lastError = null
      }
      const available = scan.importable || scan.total || 0
      if (available > (repo.available || 0)) repo.available = available

      const installed = []
      const skipped = rejected.slice()
      const usedNames = new Set(state.skills.map(function (skill) { return skill.name }))
      for (const item of selected) {
        const parsed = item.record.parsed
        const samePath = state.skills.find(function (skill) { return skill.repoId === repo.id && skill.relPath === item.relPath })
        let effective = samePath ? samePath.name : (item.requested || parsed.name)
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(effective)) {
          skipped.push({ relPath: item.relPath, name: effective, reason: 'skill 名称不合法：' + effective })
          continue
        }
        const existing = state.skills.find(function (skill) { return skill.name === effective })
        if (!samePath && usedNames.has(effective)) {
          skipped.push({ relPath: item.relPath, name: effective, reason: '同名 skill 已存在（来自另一个仓库），请先移除或改名' })
          continue
        }

        const now = Date.now()
        if (existing && existing.repoId === repo.id) {
          existing.name = effective
          existing.sourceName = parsed.name
          existing.description = parsed.description
          existing.whenToUse = parsed.whenToUse
          existing.invocation = parsed.invocation
          existing.relPath = item.relPath
          existing.enabled = true
          existing.bytes = parsed.bytes
          existing.updatedAt = now
          existing.lastError = null
          installed.push(existing.name)
        } else {
          usedNames.add(effective)
          state.skills.push({
            name: effective,
            sourceName: parsed.name,
            description: parsed.description,
            whenToUse: parsed.whenToUse,
            invocation: parsed.invocation,
            repoId: repo.id,
            relPath: item.relPath,
            enabled: true,
            files: 0,
            bytes: parsed.bytes,
            importedAt: now,
            updatedAt: now,
            lastError: null
          })
          installed.push(effective)
        }
      }
      saveState(state)
      this.resetMemo()
      this.cleanupOrphanSnapshots(state)
      this.invalidate()
      this.log.push('info', null, '从 ' + scan.source.url + ' 导入 ' + String(installed.length) + ' 个 skill')
      return { ok: true, repo: repo.id, installed: installed, skipped: skipped, snapshot: snapshot.rel, commit: scan.commit || null }
    })
  }

  async scanRepoSnapshot(repo) {
    if (!repo || !repo.snapshot) throw new Error('仓库快照不存在，请先更新仓库')
    const dir = snapshotDir(repo.snapshot)
    if (!fs.existsSync(dir)) throw new Error('仓库快照已丢失，请先更新仓库')
    const cached = this.repoScans.get(repo.id)
    if (cached && cached.snapshot === repo.snapshot && Date.now() - cached.at < REPO_SCAN_TTL_MS) return cached
    const scanned = await scanSkills(dir)
    const described = describeScan(scanned.records)
    const entry = {
      at: Date.now(),
      snapshot: repo.snapshot,
      described: described.slice(0, MAX_IMPORT_SKILLS),
      records: scanned.records.slice(0, MAX_IMPORT_SKILLS),
      total: described.length,
      importable: described.filter(function (item) { return item.valid }).length,
      truncated: scanned.truncated
    }
    this.repoScans.set(repo.id, entry)
    return entry
  }

  async backfillAvailability() {
    const state = loadState()
    const targets = state.repos.filter(function (repo) { return !repo.available && repo.snapshot })
    if (targets.length === 0) return { ok: true, updated: 0 }
    const found = []
    for (const repo of targets) {
      try {
        const scan = await this.scanRepoSnapshot(repo)
        if (scan && scan.importable > 0) found.push({ id: repo.id, available: scan.importable })
      } catch (error) {}
    }
    if (found.length === 0) return { ok: true, updated: 0 }
    await this.mutate(function (current) {
      for (const item of found) {
        const target = current.repos.find(function (repo) { return repo.id === item.id })
        if (target) target.available = Math.max(target.available || 0, item.available)
      }
    })
    return { ok: true, updated: found.length }
  }

  async inspectRepo(repoId) {
    const state = loadState()
    const repo = state.repos.find(function (item) { return item.id === repoId })
    if (!repo) throw new Error('仓库不存在：' + repoId)
    const scan = await this.scanRepoSnapshot(repo)
    const imported = new Map()
    for (const skill of state.skills) if (skill.repoId === repo.id) imported.set(skill.relPath, skill)
    const skills = scan.described.map(function (item) {
      const owned = imported.get(item.relPath) || null
      return {
        relPath: item.relPath,
        name: owned ? owned.name : item.name,
        suggestedName: item.name,
        description: item.description,
        valid: item.valid,
        reason: item.reason,
        duplicate: item.duplicate,
        hidden: item.hidden,
        imported: !!owned,
        enabled: owned ? owned.enabled : false
      }
    })
    return {
      ok: true,
      repo: {
        id: repo.id,
        url: repo.url,
        kind: repo.kind,
        ref: repo.ref,
        subdir: repo.subdir || '',
        commit: repo.commit,
        shortCommit: repo.commit ? String(repo.commit).slice(0, 8) : null,
        snapshot: repo.snapshot,
        skills: imported.size,
        available: scan.importable,
        enabled: Array.from(imported.values()).filter(function (skill) { return skill.enabled }).length,
        updateAvailable: !!(repo.latestCommit && repo.commit && repo.latestCommit !== repo.commit),
        truncated: scan.truncated
      },
      imported: imported.size,
      available: scan.importable,
      skills: skills
    }
  }

  async importFromRepo(body) {
    const repoId = String((body && body.repoId) || '')
    const wanted = Array.isArray(body && body.skills) ? body.skills : []
    if (!repoId) throw new Error('缺少 repoId')
    if (wanted.length === 0) throw new Error('请至少选择一个 skill')
    const state = loadState()
    const repo = state.repos.find(function (item) { return item.id === repoId })
    if (!repo) throw new Error('仓库不存在：' + repoId)
    const scan = await this.scanRepoSnapshot(repo)
    const byRel = new Map()
    for (const record of scan.records) byRel.set(record.relPath, record)
    const describedByRel = new Map()
    for (const item of scan.described) describedByRel.set(item.relPath, item)
    const unique = []
    const seenRel = new Set()
    for (const item of wanted) {
      const rel = String((item && item.relPath) || '')
      if (!rel || seenRel.has(rel)) continue
      seenRel.add(rel)
      unique.push({ relPath: rel, name: String((item && item.name) || '').trim() })
    }
    const selected = []
    const skipped = []
    for (const item of unique) {
      const record = byRel.get(item.relPath)
      const described = describedByRel.get(item.relPath)
      if (!record || !described) { skipped.push({ relPath: item.relPath, name: '', reason: '不在仓库快照中' }); continue }
      if (!record.parsed.ok) { skipped.push({ relPath: item.relPath, name: described.originalName, reason: described.reason }); continue }
      selected.push({ relPath: item.relPath, record: record, described: described, requested: item.name })
    }
    if (selected.length === 0) throw new Error('没有可导入的 skill：' + skipped.map(function (item) { return item.reason }).join('；'))

    return await withLock(path.join(managerDir(), 'state.lock'), async () => {
      const current = loadState()
      const target = current.repos.find(function (item) { return item.id === repoId })
      if (!target) throw new Error('仓库不存在：' + repoId)
      const installed = []
      const used = new Set(current.skills.map(function (skill) { return skill.name }))
      for (const item of selected) {
        const parsed = item.record.parsed
        const same = current.skills.find(function (skill) { return skill.repoId === target.id && skill.relPath === item.relPath })
        const effective = same ? same.name : (item.requested || item.described.suggestedName || parsed.name)
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(effective)) {
          skipped.push({ relPath: item.relPath, name: effective, reason: 'skill 名称不合法：' + effective })
          continue
        }
        if (!same && used.has(effective)) {
          skipped.push({ relPath: item.relPath, name: effective, reason: '同名 skill 已存在（来自另一个仓库），请先移除或改名' })
          continue
        }
        const now = Date.now()
        if (same) {
          same.sourceName = parsed.name
          same.description = parsed.description
          same.whenToUse = parsed.whenToUse
          same.invocation = parsed.invocation
          same.enabled = true
          same.bytes = parsed.bytes
          same.updatedAt = now
          same.lastError = null
          installed.push(same.name)
        } else {
          used.add(effective)
          current.skills.push({
            name: effective,
            sourceName: parsed.name,
            description: parsed.description,
            whenToUse: parsed.whenToUse,
            invocation: parsed.invocation,
            repoId: target.id,
            relPath: item.relPath,
            enabled: true,
            files: 0,
            bytes: parsed.bytes,
            importedAt: now,
            updatedAt: now,
            lastError: null
          })
          installed.push(effective)
        }
      }
      if (scan.importable > (target.available || 0)) target.available = scan.importable
      target.updatedAt = Date.now()
      saveState(current)
      this.resetMemo()
      this.repoScans.delete(target.id)
      this.invalidate()
      this.log.push('info', null, '从 ' + target.url + ' 补充导入 ' + String(installed.length) + ' 个 skill')
      return { ok: true, installed: installed, skipped: skipped, repo: target.id, available: target.available }
    })
  }

  async toggleRepo(repoId, enabled) {
    return await this.mutate(function (state) {
      const repo = state.repos.find(function (item) { return item.id === repoId })
      if (!repo) throw new Error('仓库不存在：' + repoId)
      const now = Date.now()
      let changed = 0
      for (const skill of state.skills) {
        if (skill.repoId !== repoId) continue
        if (skill.enabled === !!enabled) continue
        skill.enabled = !!enabled
        skill.updatedAt = now
        changed += 1
      }
      return changed
    }, function (changed) { return { ok: true, changed: changed } })
  }

  async toggleSkill(name, enabled) {
    return await this.mutate(function (state) {
      const skill = state.skills.find(function (item) { return item.name === name })
      if (!skill) throw new Error('未找到 skill：' + name)
      skill.enabled = !!enabled
      skill.updatedAt = Date.now()
      return skill
    }, function (skill) { return { ok: true, skill: skill.name, enabled: skill.enabled } })
  }

  async bulkSkills(action) {
    return await this.mutate(function (state) {
      const now = Date.now()
      let count = 0
      for (const skill of state.skills) {
        let next = skill.enabled
        if (action === 'all') next = true
        else if (action === 'none') next = false
        else if (action === 'invert') next = !skill.enabled
        else throw new Error('未知的批量操作：' + action)
        if (next !== skill.enabled) { skill.enabled = next; skill.updatedAt = now; count += 1 }
      }
      return count
    }, function (count) { return { ok: true, changed: count } })
  }

  async removeSkill(name) {
    const manager = this
    return await this.mutate(function (state) {
      const skill = state.skills.find(function (item) { return item.name === name })
      if (!skill) throw new Error('未找到 skill：' + name)
      state.skills = state.skills.filter(function (item) { return item.name !== name })
      const repo = state.repos.find(function (item) { return item.id === skill.repoId })
      if (repo && !state.skills.some(function (item) { return item.repoId === repo.id })) {
        state.repos = state.repos.filter(function (item) { return item.id !== repo.id })
        manager.repoScans.delete(repo.id)
        if (repo.snapshot) { try { removeSnapshot(repo.snapshot) } catch (error) {} }
      }
      return { name: name, repo: repo ? repo.id : null }
    }, function (result) { return { ok: true, removed: result.name } })
  }

  async mutate(work, done, options) {
    const opts = options || {}
    const result = await withLock(path.join(managerDir(), 'state.lock'), async () => {
      const state = loadState()
      const output = await work(state)
      saveState(state)
      this.resetMemo()
      this.cleanupOrphanSnapshots(state)
      // A probe that only refreshes remote commit hashes must not make DSH reload
      // the whole skill catalog: invalidate only when skill content changed.
      if (opts.invalidate !== false) this.invalidate()
      return output
    })
    if (typeof done === 'function') return done(result)
    return { ok: true, result: result }
  }

  async checkUpdates() {
    const state = loadState()
    // Local folders have no remote to compare against; skip them entirely.
    const targets = state.repos.filter(function (repo) { return repo.kind !== 'local' })
    const startedAt = Date.now()
    const checked = await mapLimit(targets, 4, async function (repo) {
      const source = { kind: repo.kind, url: repo.url, ref: repo.ref, subdir: repo.subdir || '' }
      try {
        const head = await remoteHead(source, { timeoutMs: 20000 })
        return { id: repo.id, commit: repo.commit, latestCommit: head.commit || null, error: null }
      } catch (error) {
        // One unreachable repository must not fail the whole probe.
        return { id: repo.id, commit: repo.commit, latestCommit: null, error: errorText(error) }
      }
    })
    const summary = await this.mutate(function (current) {
      let updates = 0
      const rows = []
      for (const repo of current.repos) {
        if (repo.kind === 'local') continue
        const match = checked.find(function (item) { return item.id === repo.id })
        if (!match) continue
        repo.checkedAt = startedAt
        if (match.latestCommit) repo.latestCommit = match.latestCommit
        repo.lastError = match.error || null
        const updateAvailable = !!(repo.latestCommit && repo.commit && repo.latestCommit !== repo.commit)
        if (updateAvailable) updates += 1
        rows.push({
          id: repo.id,
          commit: repo.commit,
          latestCommit: repo.latestCommit,
          updateAvailable: updateAvailable,
          error: repo.lastError
        })
      }
      return { updates: updates, failed: checked.filter(function (item) { return item.error }).length, checkedAt: startedAt, repos: rows }
    }, function (list) { return list }, { invalidate: false })
    if (summary.updates > 0) this.log.push('info', null, '发现 ' + String(summary.updates) + ' 个仓库有新提交')
    if (summary.failed > 0) {
      const first = checked.find(function (item) { return item.error })
      this.log.push('warn', null, '检查更新失败：' + String(summary.failed) + ' 个仓库（' + String((first && first.error) || '未知错误') + '）')
    }
    return { ok: true, updates: summary.updates, failed: summary.failed, checkedAt: summary.checkedAt, repos: summary.repos }
  }

  async updateRepo(repoId) {
    const manager = this
    const state = loadState()
    const repo = state.repos.find(function (item) { return item.id === repoId })
    if (!repo) throw new Error('仓库不存在：' + repoId)
    const source = { kind: repo.kind, url: repo.url, ref: repo.ref, subdir: repo.subdir || '' }
    const dir = path.join(tmpDir(), 'update-' + newId('upd'))
    await fsp.mkdir(dir, { recursive: true })
    try {
      const cloned = await cloneSource(source, dir)
      const scanned = await scanSkills(cloned.dir || dir)
      const byRel = new Map()
      for (const record of scanned.records) byRel.set(record.relPath, record)
      const snapshot = await createSnapshot(cloned.dir || dir, sourceSlug(source), cloned.commit)
      return await this.mutate(function (current) {
        const target = current.repos.find(function (item) { return item.id === repoId })
        if (!target) throw new Error('仓库不存在：' + repoId)
        const oldSnapshot = target.snapshot
        target.snapshot = snapshot.rel
        target.commit = cloned.commit || target.commit
        target.ref = cloned.ref || target.ref
        target.files = snapshot.files
        target.bytes = snapshot.bytes
        target.available = Math.max(target.available || 0, scanned.records.filter(function (record) { return record.parsed.ok }).length)
        target.updatedAt = Date.now()
        manager.repoScans.delete(repoId)
        target.latestCommit = cloned.commit || target.latestCommit
        target.lastError = null
        for (const skill of current.skills) {
          if (skill.repoId !== repoId) continue
          const record = byRel.get(skill.relPath)
          if (!record) { skill.lastError = '上游仓库中已不存在该 skill 路径'; continue }
          if (!record.parsed.ok) { skill.lastError = record.parsed.error; continue }
          skill.description = record.parsed.description
          skill.whenToUse = record.parsed.whenToUse
          skill.invocation = record.parsed.invocation
          skill.bytes = record.parsed.bytes
          skill.lastError = null
          skill.updatedAt = Date.now()
        }
        if (oldSnapshot && oldSnapshot !== snapshot.rel) {
          const stillUsed = current.repos.some(function (item) { return item.snapshot === oldSnapshot })
          if (!stillUsed) { try { removeSnapshot(oldSnapshot) } catch (error) {} }
        }
        manager.log.push('info', null, '已更新 ' + sourceSlug(source) + '：' + String(cloned.commit || target.commit || '').slice(0, 8))
        return { snapshot: snapshot.rel, commit: cloned.commit || null, ref: cloned.ref || null }
      }, function (result) { return { ok: true, repo: repoId, snapshot: result.snapshot, commit: result.commit, ref: result.ref } })
    } finally {
      try { await fsp.rm(dir, { recursive: true, force: true }) } catch (ignored) {}
    }
  }

  async updateSkill(name) {
    const state = loadState()
    const skill = state.skills.find(function (item) { return item.name === name })
    if (!skill) throw new Error('未找到 skill：' + name)
    const result = await this.updateRepo(skill.repoId)
    return { ok: true, skill: name, repo: result.repo, commit: result.commit, ref: result.ref }
  }

  cleanupOrphanSnapshots(state) {
    const referenced = new Set(state.repos.map(function (repo) { return repo.snapshot }).filter(Boolean))
    let entries
    try { entries = fs.readdirSync(reposDir()) } catch (error) { return 0 }
    let removed = 0
    for (const name of entries) {
      if (referenced.has(name)) continue
      const target = path.join(reposDir(), name)
      try {
        const stat = fs.statSync(target)
        if (Date.now() - stat.mtimeMs < 10 * 60 * 1000) continue
      } catch (error) { continue }
      try { removeSnapshot(name); removed += 1 } catch (error) {}
    }
    return removed
  }

  async refresh() {
    return await this.mutate(function (state) {
      let updated = 0
      for (const skill of state.skills) {
        const repo = state.repos.find(function (item) { return item.id === skill.repoId })
        if (!repo || !repo.snapshot) continue
        const dir = snapshotDir(repo.snapshot)
        const file = path.join(dir, skill.relPath.split('/').join(path.sep), 'SKILL.md')
        try {
          const text = fs.readFileSync(file, 'utf8')
          const parsed = parseSkillText(text)
          if (!parsed.ok) { skill.lastError = parsed.error; continue }
          if (skill.sourceName === undefined) skill.sourceName = parsed.name
          if (parsed.name !== skill.sourceName) skill.sourceName = parsed.name
          skill.description = parsed.description
          skill.whenToUse = parsed.whenToUse
          skill.invocation = parsed.invocation
          skill.bytes = Buffer.byteLength(text, 'utf8')
          skill.lastError = null
          skill.updatedAt = Date.now()
          updated += 1
        } catch (error) {
          skill.lastError = errorText(error)
        }
      }
      return updated
    }, function (count) { return { ok: true, refreshed: count } })
  }

  async content(name) {
    const state = loadState()
    const skill = state.skills.find(function (item) { return item.name === name })
    if (!skill) throw new Error('未找到 skill：' + name)
    const resolved = this.resolveSkill(state, skill)
    if (!resolved || !resolved.exists) throw new Error('SKILL.md 不在快照中')
    const buffer = fs.readFileSync(resolved.file)
    const truncated = buffer.length > MAX_CONTENT_BYTES
    return {
      ok: true,
      name: name,
      path: resolved.file,
      bytes: buffer.length,
      truncated: truncated,
      content: buffer.subarray(0, MAX_CONTENT_BYTES).toString('utf8')
    }
  }

  // ── Provider surface ────────────────────────────────────────────────────
  providerCandidates() {
    const state = this.loadCachedState()
    this.missing = new Set()
    const candidates = []
    for (const skill of state.skills) {
      if (!skill.enabled) continue
      const resolved = this.resolveSkill(state, skill)
      if (!resolved || !resolved.exists) { this.missing.add(skill.name); continue }
      candidates.push({
        name: skill.name,
        description: skill.description,
        whenToUse: skill.whenToUse || undefined,
        invocation: skill.invocation,
        source: PROVIDER_SOURCE,
        provider: PROVIDER_NAME,
        rank: PROVIDER_RANK,
        path: resolved.file,
        locator: { name: skill.name, repoId: skill.repoId, relPath: skill.relPath },
        resourceBase: { kind: 'directory', path: resolved.dir }
      })
    }
    return candidates
  }

  async providerDefinition(candidate) {
    const locator = candidate && candidate.locator ? candidate.locator : {}
    const state = loadState()
    const skill = state.skills.find(function (item) { return item.name === locator.name })
    if (!skill || !skill.enabled) return undefined
    const resolved = this.resolveSkill(state, skill)
    if (!resolved || !resolved.exists) throw new Error('skill "' + skill.name + '" 的 SKILL.md 不在快照中')
    const text = fs.readFileSync(resolved.file, 'utf8')
    const parsed = parseSkillText(text)
    if (!parsed.ok) throw new Error('skill "' + skill.name + '" 无法加载：' + parsed.error)

    return {
      name: skill.name,
      description: parsed.description,
      whenToUse: parsed.whenToUse,
      invocation: parsed.invocation,
      source: PROVIDER_SOURCE,
      provider: PROVIDER_NAME,
      rank: PROVIDER_RANK,
      path: resolved.file,
      resourceBase: { kind: 'directory', path: resolved.dir },
      content: parsed.content
    }
  }
}

export function createManager(ctx, config) {
  return new SkillManager(ctx, config)
}
