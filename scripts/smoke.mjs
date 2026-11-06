#!/usr/bin/env node
// Fast offline smoke test: host modules load, provider contract, frontmatter
// edge cases, built client parses. No network, no git, no DSH runtime.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'

const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-skills-smoke-'))
process.env.DSH_HOME = home

const frontmatter = await import('../lib/frontmatter.js')
const { parseSkillText } = frontmatter
const { createManager } = await import('../lib/manager.js')
const { PROVIDER_NAME } = await import('../lib/provider.js')

function test(name, fn) {
  try { fn() } catch (error) {
    console.error('FAIL ' + name + ': ' + String((error && error.stack) || error))
    process.exitCode = 1
  }
}

// ── Frontmatter semantics ────────────────────────────────────────────────
test('parses quoted, block and CRLF frontmatter', function () {
  const text = '\uFEFF---\r\nname: "my-skill"\r\ndescription: >\r\n  line one\r\n  line two\r\nwhenToUse: \'single quoted\'\r\nuser-invocable: false\r\n---\r\n\r\n# Body\r\n'
  const parsed = parseSkillText(text)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.name, 'my-skill')
  assert.equal(parsed.description, 'line one line two')
  assert.equal(parsed.whenToUse, 'single quoted')
  assert.equal(parsed.invocation.userInvocable, false)
  assert.equal(parsed.invocation.modelInvocable, true)
  assert.ok(parsed.content.startsWith('# Body'))
})

test('literal block keeps newlines and chomping', function () {
  const parsed = parseSkillText('---\nname: a\ndescription: |\n  first\n  second\n---\n\nbody\n')
  assert.equal(parsed.ok, true)
  assert.equal(parsed.description, 'first\nsecond')
})

test('rejects legacy invocation keys, bad names and missing fields', function () {
  assert.equal(parseSkillText('---\nname: a\ndescription: d\ndisableModelInvocation: true\n---\n').ok, false)
  assert.equal(parseSkillText('---\nname: Bad\ndescription: d\n---\n').ok, false)
  assert.equal(parseSkillText('---\nname: a\n---\n').ok, false)
  assert.equal(parseSkillText('no frontmatter\n').ok, false)
  assert.equal(parseSkillText('---\nname: a\ndescription: d\nuser-invocable: nope\n---\n').ok, false)
})

// ── Manager + provider registration ──────────────────────────────────────
const manager = createManager(null, {})
const views = await manager.ready
assert.equal(views.ok, true)
assert.equal(views.provider.name, PROVIDER_NAME)
assert.equal(views.provider.rank, 350)
assert.ok(fs.existsSync(path.join(home, 'dsh-skills-tools')))

let created = null
let disposals = 0
const fakeCtx = {
  skills: {
    registerProvider: function (create) {
      const control = { invalidate: function () {}, signal: undefined }
      created = create(control)
      return function () { disposals += 1 }
    }
  }
}
assert.equal(manager.attachSkills(fakeCtx), true)
assert.ok(created && typeof created.list === 'function' && typeof created.get === 'function')
assert.equal(created.name, PROVIDER_NAME)
assert.equal(created.list({}).length, 0)

// ── Client bundle ────────────────────────────────────────────────────────
const clientPath = path.join(process.cwd(), 'client', 'client.js')
const clientText = fs.readFileSync(clientPath, 'utf8')
new vm.Script(clientText, { filename: clientPath })
assert.ok(clientText.includes('id: "skills"'))
assert.ok(clientText.includes('order: 19'))
assert.ok(clientText.includes('"/skills-tools/api"'))

// ── Sparse checkout static contract ──────────────────────────────────────
const gitSource = fs.readFileSync(path.join(process.cwd(), 'lib', 'git.js'), 'utf8')
assert.ok(gitSource.includes('--sparse'), 'git.js must clone with --sparse')
assert.ok(gitSource.includes('--filter=blob:none'), 'git.js must use a blobless partial clone')
assert.ok(gitSource.includes("'sparse-checkout'"), 'git.js must call git sparse-checkout')
assert.ok(gitSource.includes("'set', '--cone'"), 'git.js must use cone mode sparse-checkout')
assert.ok(gitSource.includes('sparseClone') && gitSource.includes('fullClone'), 'sparse clone must fall back to the full clone')
assert.ok(gitSource.includes('rmSync(destDir'), 'fallback must delete the half-finished sparse checkout')
assert.match(gitSource, /if \(sparse\) return sparse[\s\S]*?return await fullClone\(source, destDir, commitRef\)/, 'fallback branch must run the full clone')

const { resolveSource } = await import('../lib/git.js')
const treeSource = resolveSource({ url: 'https://github.com/vercel/next.js/tree/canary/skills' })
assert.equal(treeSource.url, 'https://github.com/vercel/next.js')
assert.equal(treeSource.ref, 'canary')
assert.equal(treeSource.subdir, 'skills')
const gitlabSource = resolveSource({ url: 'https://gitlab.example.com/group/project/-/tree/main/plugins/x/skills' })
assert.equal(gitlabSource.url, 'https://gitlab.example.com/group/project')
assert.equal(gitlabSource.ref, 'main')
assert.equal(gitlabSource.subdir, 'plugins/x/skills')

// ── Locale files ─────────────────────────────────────────────────────────
for (const lang of ['zh', 'en']) {
  const dict = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'locale', lang + '.json'), 'utf8'))
  assert.equal(dict.nav, lang === 'zh' ? '技能' : 'Skills')
}

manager.dispose()
assert.equal(disposals, 1)
await fsp.rm(home, { recursive: true, force: true })
if (process.exitCode) process.exit(process.exitCode)
console.log('smoke OK: frontmatter + manager + provider + client bundle + locale + sparse checkout contract')
