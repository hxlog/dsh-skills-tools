#!/usr/bin/env node
// dsh-go catalogue readiness: structural checks on dsh-package.json plus an
// optional remote lookup (node scripts/verify-dsh-go.mjs --url <catalogue>).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dsh-package.json'), 'utf8'))
const problems = []
function check(name, fn) {
  try { fn() } catch (error) { problems.push(name + ': ' + String((error && error.message) || error)) }
}

check('manifest_version 2 plugin shape', function () {
  assert.equal(manifest.manifest_version, 2)
  assert.equal(manifest.type, 'plugin')
  assert.equal(manifest.channel, 'stable')
  assert.match(manifest.id, /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/)
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/)
})

check('entrypoint exists and matches package dsh.bundle', function () {
  assert.equal(manifest.entrypoints.bundle, 'cordis.patch.yml')
  assert.equal(pkg.dsh.bundle.patch.replace(/^\.\//, ''), manifest.entrypoints.bundle)
  assert.ok(fs.existsSync(path.join(root, manifest.entrypoints.bundle)))
})

check('version matches package.json', function () {
  assert.equal(manifest.version, pkg.version)
})

check('capabilities and permissions are declared', function () {
  for (const capability of ['skills.management', 'skills.provider', 'settings.panel']) {
    assert.ok(manifest.capabilities.includes(capability), 'missing capability ' + capability)
  }
  const allowed = ['fs.read', 'fs.write', 'network', 'process.spawn']
  assert.ok(manifest.permissions.length > 0)
  for (const permission of manifest.permissions) assert.ok(allowed.includes(permission), 'unknown permission ' + permission)
})

check('publisher, source and metadata point at the same repository', function () {
  assert.ok(manifest.publisher && manifest.publisher.id === 'hxlog')
  const repo = manifest.source && manifest.source.repo
  assert.equal(repo, 'hxlog/dsh-skills-tools')
  assert.equal(manifest.metadata.repository, repo)
  assert.match(manifest.metadata.homepage, /github\.com\/hxlog\/dsh-skills-tools/)
  assert.equal(pkg.repository.url, 'git+https://github.com/' + repo + '.git')
})

check('compatibility covers the Node baseline', function () {
  assert.match(manifest.compatibility.node, />=22\.13/)
  assert.equal(pkg.engines.node, '>=22.13')
  assert.ok(manifest.compatibility.os.includes('win32'))
})

check('zero runtime dependencies', function () {
  assert.deepEqual(manifest.dependencies || [], [])
  assert.equal(pkg.dependencies, undefined)
})

const remoteIndex = process.argv.indexOf('--url')
if (remoteIndex > 0) {
  const url = process.argv[remoteIndex + 1]
  if (!url) throw new Error('--url requires a catalogue URL')
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  assert.ok(response.ok, 'catalogue fetch failed: HTTP ' + response.status)
  const payload = await response.json()
  const entries = Array.isArray(payload) ? payload : (payload.plugins || payload.packages || [])
  const hit = entries.find(function (entry) {
    const id = entry && (entry.id || entry.name || entry.package)
    return id === 'hxlog/dsh-skills-tools' || id === 'dsh-skills-tools'
  })
  assert.ok(hit, 'plugin not present in remote catalogue ' + url)
  console.log('remote catalogue entry: ' + JSON.stringify(hit))
}

if (problems.length > 0) {
  console.error('verify:dsh-go failed:')
  for (const problem of problems) console.error(' - ' + problem)
  process.exit(1)
}
console.log('verify:dsh-go OK: manifest, entrypoint, capabilities, publisher, compatibility')
