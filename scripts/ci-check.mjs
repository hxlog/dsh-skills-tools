#!/usr/bin/env node
// Marketplace-ready contract checks for dsh-skills-tools. Runs in CI with no
// network and no dependency install.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8') }
function json(file) { return JSON.parse(read(file)) }
const problems = []
function check(name, fn) {
  try { fn() } catch (error) { problems.push(name + ': ' + String((error && error.message) || error)) }
}

const pkg = json('package.json')
const manifest = json('dsh-package.json')
const patch = read('cordis.patch.yml')

check('package identity', function () {
  assert.equal(pkg.name, 'dsh-skills-tools')
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/)
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.license, 'MIT')
  assert.equal(pkg.publishConfig.access, 'public')
})

check('bundle + client manifest', function () {
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-locale'))
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings'))
})

check('no dependencies and no lifecycle scripts', function () {
  assert.equal(pkg.dependencies, undefined)
  assert.equal(pkg.devDependencies, undefined)
  assert.equal(pkg.peerDependencies, undefined)
  const scripts = pkg.scripts || {}
  for (const name of ['preinstall', 'install', 'postinstall', 'prepublish', 'prepare']) {
    assert.equal(scripts[name], undefined, 'lifecycle script ' + name + ' is not allowed')
  }
  assert.ok(scripts.test && scripts['ci-check'])
})

check('files list covers every shipped asset', function () {
  for (const file of ['lib', 'client/client.js', 'locale', 'cordis.patch.yml', 'icon.svg', 'README.md', 'README.en.md', 'LICENSE']) {
    assert.ok(pkg.files.includes(file), 'files is missing ' + file)
    assert.ok(fs.existsSync(path.join(root, file)), 'missing shipped file ' + file)
  }
  assert.equal(pkg.main, './lib/index.js')
  assert.ok(fs.existsSync(path.join(root, 'lib', 'index.js')))
})

check('cordis bundle patch inserts one host row', function () {
  assert.match(patch, /-\s+insert:/)
  assert.match(patch, /id:\s*skills-tools/)
  assert.match(patch, /name:\s*dsh-skills-tools/)
})

check('dsh-package manifest', function () {
  assert.equal(manifest.manifest_version, 2)
  assert.equal(manifest.type, 'plugin')
  assert.equal(manifest.id, 'hxlog/dsh-skills-tools')
  assert.equal(manifest.entrypoints.bundle, 'cordis.patch.yml')
  assert.ok(manifest.capabilities.includes('skills.provider'))
  assert.ok(manifest.capabilities.includes('skills.management'))
  for (const permission of manifest.permissions) {
    assert.ok(['fs.read', 'fs.write', 'network', 'process.spawn'].includes(permission), 'unexpected permission ' + permission)
  }
  assert.ok(manifest.publisher && manifest.publisher.id)
})

check('host modules are ESM and import-clean', function () {
  for (const file of fs.readdirSync(path.join(root, 'lib'))) {
    if (!file.endsWith('.js')) continue
    const text = read(path.join('lib', file))
    assert.ok(!/\brequire\s*\(/.test(text), file + ' must not use require()')
    assert.ok(!/\bmodule\.exports\b/.test(text), file + ' must not use module.exports')
    assert.ok(!/\bprocess\.exit\b/.test(text), file + ' must not exit the host process')
  }
  const index = read('lib/index.js')
  assert.match(index, /export const name/)
  assert.match(index, /export function apply/)
})

check('client is a parseable classic bundle', function () {
  const client = read('client/client.js')
  new vm.Script(client, { filename: 'client/client.js' })
  assert.ok(client.includes('window.__ModuleLoader__.load('))
  assert.ok(client.includes('id: "skills"'))
  assert.ok(client.includes('order: 19'))
  assert.ok(client.includes('var API_BASE = "/skills-tools/api"'))
  assert.ok(client.includes('exports.inject = inject'))
  // Catch a stale client/client.js: the bundle must be rebuilt from src.
  assert.ok(client.includes('collapseAll: "全部折叠"'), 'client bundle is stale: run node scripts/build-client.mjs')
  assert.ok(client.includes('logsDesc:'), 'client bundle is stale: activity dialog missing')
  assert.ok(client.includes('AUTO_CHECK_MS'), 'client bundle is stale: automatic update probe missing')
})

check('i18n dictionaries have identical keys and both nav labels', function () {
  const src = read('client/client.src.js')
  const zhStart = src.indexOf('zh: {')
  const enStart = src.indexOf('en: {')
  assert.ok(zhStart > 0 && enStart > zhStart)
  const zhBlock = src.slice(zhStart, enStart)
  const enBlock = src.slice(enStart, src.indexOf('    };', enStart))
  function keys(block) {
    const out = []
    const re = /^        ([a-zA-Z0-9_]+):/gm
    let match
    while ((match = re.exec(block))) out.push(match[1])
    return out
  }
  const zhKeys = keys(zhBlock)
  const enKeys = keys(enBlock)
  assert.ok(zhKeys.length > 60, 'zh dictionary looks truncated: ' + zhKeys.length)
  assert.deepEqual(enKeys, zhKeys)
  const client = read('client/client.js')
  assert.ok(client.includes('nav: "技能"'))
  assert.ok(client.includes('nav: "Skills"'))
})

check('docs and CI assets exist', function () {
  for (const file of ['docs/API.md', 'docs/VERIFICATION.md', 'docs/MARKETPLACES.md', 'docs/SUBMISSION-KIT.md', '.github/workflows/ci.yml']) {
    assert.ok(fs.existsSync(path.join(root, file)), 'missing ' + file)
  }
})

check('no absolute local paths leaked into shipped sources', function () {
  const files = ['lib/index.js', 'lib/manager.js', 'lib/routes.js', 'client/client.js', 'package.json']
  for (const file of files) {
    const text = read(file)
    assert.ok(!/C:[\\/]{1,2}Users/.test(text), file + ' leaks a local path')
  }
})

if (problems.length > 0) {
  console.error('ci-check failed:')
  for (const problem of problems) console.error(' - ' + problem)
  process.exit(1)
}
console.log('ci-check OK: manifest + patch + ESM + client bundle + i18n parity')
