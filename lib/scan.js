// lib/scan.js — recursive SKILL.md discovery with hard bounds.
import fsp from 'node:fs/promises'
import fs from 'node:fs'
import path from 'node:path'
import { parseSkillText } from './frontmatter.js'
import { toPosix } from './util.js'

const SKIP_DIRS = new Set([
  '.git', '.hg', '.svn', 'node_modules', '.venv', 'venv', '.tox', '__pycache__',
  'dist', 'build', 'out', '.next', '.nuxt', '.cache', '.idea', '.gradle', 'target',
  'vendor', 'Pods', '.terraform'
])

export const MAX_SCAN_DEPTH = 10
export const MAX_SCAN_FILES = 40000
export const MAX_SKILL_BYTES = 2 * 1024 * 1024

export async function readSkillFile(file) {
  const stat = await fsp.stat(file)
  if (stat.size > MAX_SKILL_BYTES) throw new Error('SKILL.md 超过 ' + String(Math.round(MAX_SKILL_BYTES / 1024)) + ' KiB，已跳过')
  return await fsp.readFile(file, 'utf8')
}

export async function parseSkillPath(file) {
  try {
    const text = await readSkillFile(file)
    const parsed = parseSkillText(text)
    if (!parsed.ok) return { ok: false, error: parsed.error }
    return {
      ok: true,
      name: parsed.name,
      description: parsed.description,
      whenToUse: parsed.whenToUse,
      invocation: parsed.invocation,
      metadata: parsed.metadata,
      content: parsed.content,
      bytes: Buffer.byteLength(text, 'utf8')
    }
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) }
  }
}

// Walk the tree and return one record per directory that contains SKILL.md.
// A skill directory is not descended into, so nested assets can never be
// mistaken for skills. Symlinked directories are skipped (no escape / loops).
export async function scanSkills(rootDir, options) {
  const opts = options || {}
  const maxDepth = Math.min(MAX_SCAN_DEPTH, opts.maxDepth || MAX_SCAN_DEPTH)
  const maxFiles = Math.min(MAX_SCAN_FILES, opts.maxFiles || MAX_SCAN_FILES)
  const records = []
  let visited = 0
  let truncated = false

  async function walk(dir, depth) {
    if (truncated) return
    if (depth > maxDepth) return
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch (error) {
      return
    }
    entries.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0 })
    for (const entry of entries) {
      if (truncated) return
      if (entry.isSymbolicLink()) continue
      const abs = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        const skillFile = path.join(abs, 'SKILL.md')
        let isSkill = false
        try {
          const stat = await fsp.stat(skillFile)
          isSkill = stat.isFile()
        } catch (error) { isSkill = false }
        if (isSkill) {
          visited += 1
          if (visited > maxFiles) { truncated = true; return }
          const parsed = await parseSkillPath(skillFile)
          records.push({
            relPath: toPosix(path.relative(rootDir, abs)),
            dir: abs,
            file: skillFile,
            parsed: parsed
          })
          continue
        }
        await walk(abs, depth + 1)
      } else if (entry.isFile() && entry.name.endsWith('.md') && depth === 0) {
        // Flat Markdown skills at the repository root are not supported:
        // the DSH user root has no cross-repo folder to attach resources to.
        continue
      }
    }
  }

  await walk(rootDir, 0)
  return { records: records, truncated: truncated }
}

export function describeScan(records) {
  const claimed = new Map()
  const claimedNames = new Set()
  for (const record of records) {
    if (record.parsed.ok) claimedNames.add(record.parsed.name)
  }
  return records.map(function (record) {
    const parsed = record.parsed
    let duplicate = false
    let suggestedName = parsed.ok ? parsed.name : ''
    let originalName = parsed.ok ? parsed.name : ''
    if (parsed.ok) {
      const owner = claimed.get(parsed.name)
      if (owner === undefined) {
        claimed.set(parsed.name, record.relPath)
      } else {
        duplicate = true
        suggestedName = disambiguate(record.relPath, parsed.name, claimedNames)
        claimedNames.add(suggestedName)
        claimed.set(suggestedName, record.relPath)
      }
    }
    return {
      relPath: record.relPath,
      name: suggestedName,
      originalName: originalName,
      suggestedName: suggestedName,
      duplicate: duplicate,
      description: parsed.ok ? parsed.description : '',
      whenToUse: parsed.ok ? parsed.whenToUse : undefined,
      invocation: parsed.ok ? parsed.invocation : { modelInvocable: true, userInvocable: true },
      valid: !!parsed.ok,
      reason: parsed.ok ? '' : parsed.error,
      hidden: record.relPath.split('/').some(function (part) { return part.startsWith('.') })
    }
  })
}

// The repo layout convention is <plugin>/skills/<skill>; a duplicate name is
// disambiguated with the plugin folder (project-docs/generate ->
// project-docs-generate), and a "router" skill becomes the plugin entry itself
// (project-docs/router -> project-docs), matching how the luban team publishes.
export function disambiguate(relPath, name, taken) {
  const segments = String(relPath).split('/').filter(Boolean)
  let plugin = ''
  const skillsIndex = segments.lastIndexOf('skills')
  if (skillsIndex > 0) plugin = segments[skillsIndex - 1]
  else if (segments.length >= 2) plugin = segments[segments.length - 2]
  let candidate = ''
  if (plugin) candidate = String(name) === 'router' ? plugin : plugin + '-' + name
  if (!candidate) candidate = 'skill-' + name
  let next = candidate
  let counter = 2
  while (taken.has(next)) { next = candidate + '-' + String(counter); counter += 1 }
  return next
}
