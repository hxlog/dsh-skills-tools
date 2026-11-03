// lib/snapshot.js — copy a cloned repository into a content-addressed snapshot.
// Snapshots are immutable and contain no .git directory. Copying is bounded and
// never follows symlinks, so a hostile repository cannot escape the snapshot.
import fsp from 'node:fs/promises'
import fs from 'node:fs'
import path from 'node:path'
import { createEventLog, errorText, isInside, reposDir, safeSlug } from './util.js'

export const MAX_SNAPSHOT_BYTES = 300 * 1024 * 1024
export const MAX_SNAPSHOT_FILES = 20000
export const MAX_SNAPSHOT_DEPTH = 24

export function snapshotRelName(slug, commit) {
  const suffix = commit ? String(commit).slice(0, 12) : 'local-' + String(Date.now())
  return slug + '-' + suffix
}

// Copy srcDir -> reposDir()/rel. Returns { rel, files, bytes, truncated }.
export async function createSnapshot(srcDir, slug, commit, managerDirOverride) {
  const base = managerDirOverride ? path.join(managerDirOverride, 'repos') : reposDir()
  const rel = snapshotRelName(slug, commit)
  const dest = path.join(base, rel)
  if (!isInside(base, dest)) throw new Error('快照路径不安全')
  if (fs.existsSync(dest)) {
    const meta = readSnapshotMeta(dest)
    if (meta) return { rel: rel, files: meta.files, bytes: meta.bytes, reused: true }
    fs.rmSync(dest, { recursive: true, force: true })
  }
  await fsp.mkdir(dest, { recursive: true })
  const counters = { files: 0, bytes: 0, truncated: false }

  async function copyDir(from, to, depth) {
    if (depth > MAX_SNAPSHOT_DEPTH) { counters.truncated = true; return }
    let entries
    try { entries = await fsp.readdir(from, { withFileTypes: true }) }
    catch (error) { throw new Error('无法读取目录 ' + from + '：' + errorText(error)) }
    entries.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0 })
    for (const entry of entries) {
      if (counters.truncated) return
      if (entry.name === '.git' || entry.name === '.hg' || entry.name === '.svn') continue
      if (entry.isSymbolicLink()) continue
      const source = path.join(from, entry.name)
      const target = path.join(to, entry.name)
      if (!isInside(dest, target)) { counters.truncated = true; return }
      if (entry.isDirectory()) {
        await fsp.mkdir(target, { recursive: true })
        await copyDir(source, target, depth + 1)
      } else if (entry.isFile()) {
        const stat = await fsp.lstat(source)
        counters.files += 1
        counters.bytes += stat.size
        if (counters.files > MAX_SNAPSHOT_FILES || counters.bytes > MAX_SNAPSHOT_BYTES) {
          counters.truncated = true
          return
        }
        await fsp.copyFile(source, target)
      }
    }
  }

  try {
    await copyDir(srcDir, dest, 0)
    if (counters.truncated) {
      await fsp.rm(dest, { recursive: true, force: true })
      throw new Error('仓库超过快照上限（' + String(MAX_SNAPSHOT_FILES) + ' 个文件 / ' + String(Math.round(MAX_SNAPSHOT_BYTES / 1024 / 1024)) + ' MiB），已拒绝导入')
    }
    const meta = { createdAt: Date.now(), files: counters.files, bytes: counters.bytes, commit: commit || null }
    await fsp.writeFile(path.join(dest, '.dsh-skills-tools-snapshot.json'), JSON.stringify(meta, null, 2), 'utf8')
    return { rel: rel, files: counters.files, bytes: counters.bytes, reused: false }
  } catch (error) {
    try { await fsp.rm(dest, { recursive: true, force: true }) } catch (ignored) {}
    throw error
  }
}

export function readSnapshotMeta(dir) {
  try {
    const text = fs.readFileSync(path.join(dir, '.dsh-skills-tools-snapshot.json'), 'utf8')
    const parsed = JSON.parse(text)
    if (parsed && Number.isFinite(parsed.files) && Number.isFinite(parsed.bytes)) return parsed
    return null
  } catch (error) { return null }
}

export function removeSnapshot(rel, managerDirOverride) {
  if (!rel) return
  const base = managerDirOverride ? path.join(managerDirOverride, 'repos') : reposDir()
  const target = path.join(base, rel)
  if (!isInside(base, target) || target === base) throw new Error('拒绝删除快照之外的路径')
  fs.rmSync(target, { recursive: true, force: true })
}

export function snapshotDir(rel, managerDirOverride) {
  const base = managerDirOverride ? path.join(managerDirOverride, 'repos') : reposDir()
  return path.join(base, rel)
}

export function cleanTmpDirs(managerDirOverride, maxAgeMs) {
  const base = managerDirOverride ? path.join(managerDirOverride, 'tmp') : path.join(process.cwd(), 'tmp')
  let entries
  try { entries = fs.readdirSync(base) } catch (error) { return 0 }
  let removed = 0
  const age = maxAgeMs || 60 * 60 * 1000
  for (const name of entries) {
    const target = path.join(base, name)
    try {
      const stat = fs.statSync(target)
      if (Date.now() - stat.mtimeMs > age) {
        fs.rmSync(target, { recursive: true, force: true })
        removed += 1
      }
    } catch (ignored) {}
  }
  return removed
}

export { safeSlug }
