#!/usr/bin/env node
// Optional network integration test (never runs in CI): proves that a monorepo
// subdirectory URL such as https://github.com/vercel/next.js/tree/canary/skills
// is imported through the sparse checkout path, without downloading the whole
// ~2.6 GiB repository.
//
// Run with:  SKILLS_TOOLS_NETWORK=1 npm run test:network
import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

if (process.env.SKILLS_TOOLS_NETWORK !== '1') {
  console.log('network sparse test skipped (set SKILLS_TOOLS_NETWORK=1 to run)')
  process.exit(0)
}

const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-skills-network-'))
process.env.DSH_HOME = home

const { createManager } = await import('../lib/manager.js')
const { loadState } = await import('../lib/state.js')

const URL = 'https://github.com/vercel/next.js/tree/canary/skills'
const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024
const MAX_SCAN_MS = 120000

function sizeOf(root) {
  let files = 0
  let bytes = 0
  const walk = function (dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const item = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(item)
      else { files += 1; bytes += fs.statSync(item).size }
    }
  }
  walk(root)
  return { files: files, bytes: bytes }
}

const manager = createManager(null, {})
await manager.ready
const started = Date.now()
try {
  const scan = await manager.scanSource({ url: URL })
  const scanMs = Date.now() - started
  console.log('scan: ' + String(scan.skills.length) + ' skills in ' + (scanMs / 1000).toFixed(1) + 's (commit ' + String(scan.commit).slice(0, 12) + ', source.subdir=' + scan.source.subdir + ')')
  assert.ok(scan.skills.length > 0, 'expected at least one Next.js skill')
  assert.ok(scan.skills.every(function (s) { return s.valid }), 'every Next.js skill must parse cleanly')
  assert.ok(scan.skills.every(function (s) { return s.relPath.startsWith('skills/') }), 'relPaths must keep the skills/ prefix')
  assert.ok(scanMs < MAX_SCAN_MS, 'scan must finish inside the git timeout, got ' + String(scanMs) + 'ms')

  const selected = scan.skills.map(function (s) { return { relPath: s.relPath, name: s.suggestedName } })
  const imported = await manager.commitImport({ scanId: scan.scanId, skills: selected })
  assert.equal(imported.ok, true)
  assert.equal(imported.installed.length, selected.length, 'every scanned skill should import')
  assert.equal(imported.skipped.length, 0, 'no skill should be skipped: ' + JSON.stringify(imported.skipped))

  const state = loadState()
  const repo = state.repos.find(function (item) { return item.url === 'https://github.com/vercel/next.js' })
  assert.ok(repo, 'repository record must be created')
  assert.equal(repo.subdir, 'skills', 'repository must persist the source subdirectory')
  assert.equal(repo.files > 0, true)
  const snapshot = path.join(home, 'dsh-skills-tools', 'repos', repo.snapshot)
  assert.ok(fs.existsSync(snapshot), 'snapshot directory must exist')
  assert.ok(!fs.existsSync(path.join(snapshot, '.git')), 'snapshot must not contain .git')
  const size = sizeOf(snapshot)
  const totalMs = Date.now() - started
  console.log('snapshot: ' + String(size.files) + ' files, ' + (size.bytes / 1024 / 1024).toFixed(2) + ' MiB; total ' + (totalMs / 1000).toFixed(1) + 's')
  assert.ok(size.bytes < MAX_SNAPSHOT_BYTES, 'snapshot must stay below 5 MiB, got ' + String(size.bytes) + ' bytes')
  assert.ok(repo.files < 20000, 'file count must stay below the snapshot cap')
  console.log('network sparse test OK: ' + String(scan.skills.length) + ' Next.js skills imported from the skills/ subtree only')
} finally {
  manager.dispose()
  await fsp.rm(home, { recursive: true, force: true })
}
