#!/usr/bin/env node
// Provider contract test: a fake ctx.skills service captures the provider the
// manager registers, then asserts candidate/definition shape, snapshot
// resourceBase (relative references), enable/disable filtering and the exact
// invalidate() calls the DSH catalog relies on. No network, no git.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-skills-provider-'))
process.env.DSH_HOME = home

const { createManager } = await import('../lib/manager.js')
const { SkillsProvider, PROVIDER_NAME, PROVIDER_RANK } = await import('../lib/provider.js')

const problems = []
async function check(name, fn) {
  try { await fn() } catch (error) { problems.push(name + ': ' + String((error && error.stack) || error)) }
}

function writeSkill(dir, frontmatter, body) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\n' + frontmatter + '\n---\n\n' + body + '\n', 'utf8')
}

const repo = path.join(home, 'provider-fixture')
writeSkill(path.join(repo, 'plugins', 'alpha', 'skills', 'alpha-skill'),
  'name: alpha-skill\ndescription: Alpha skill for provider tests\n',
  '# Alpha body\n\nRead ../../assets/template.txt then continue.')
fs.mkdirSync(path.join(repo, 'plugins', 'alpha', 'assets'), { recursive: true })
fs.writeFileSync(path.join(repo, 'plugins', 'alpha', 'assets', 'template.txt'), 'template', 'utf8')
writeSkill(path.join(repo, 'plugins', 'beta', 'skills', 'beta-skill'),
  'name: beta-skill\ndescription: Beta skill for provider tests\n',
  '# Beta body')

const manager = createManager(null, {})
await manager.ready

let imported = null
await check('import fixture repository', async () => {
  const scan = await manager.scanSource({ url: repo })
  assert.equal(scan.ok, true)
  const selected = scan.skills.filter(function (s) { return s.valid })
    .map(function (s) { return { relPath: s.relPath, name: s.suggestedName } })
  imported = await manager.commitImport({ scanId: scan.scanId, skills: selected })
  assert.deepEqual(imported.installed.slice().sort(), ['alpha-skill', 'beta-skill'])
})

const registrations = []
const control = { invalidations: 0, invalidate: function () { this.invalidations += 1 } }
let provider = null

await check('register provider through ctx.skills', async () => {
  const attached = manager.attachSkills({
    skills: {
      registerProvider: function (create) {
        registrations.push(create)
        return function () {}
      }
    }
  })
  assert.equal(attached, true)
  assert.equal(registrations.length, 1, 'exactly one provider factory must be registered')
  provider = registrations[0](control)
  assert.ok(provider instanceof SkillsProvider)
  assert.equal(provider.name, PROVIDER_NAME)
})

await check('candidates describe enabled skills and snapshot directories', async () => {
  const candidates = provider.list()
  assert.equal(candidates.length, 2)
  const alpha = candidates.find(function (c) { return c.name === 'alpha-skill' })
  const beta = candidates.find(function (c) { return c.name === 'beta-skill' })
  assert.ok(alpha && beta)
  assert.equal(alpha.provider, PROVIDER_NAME)
  assert.equal(alpha.source, 'dsh-skills-tools')
  assert.equal(alpha.rank, PROVIDER_RANK)
  assert.equal(alpha.description, 'Alpha skill for provider tests')
  assert.equal(alpha.invocation.modelInvocable, true)
  assert.equal(alpha.resourceBase.kind, 'directory')
  assert.ok(fs.statSync(alpha.resourceBase.path).isDirectory(), 'resourceBase must be a snapshot directory')
  assert.ok(fs.existsSync(alpha.path), 'candidate path must point at the snapshot SKILL.md')
  const asset = path.resolve(alpha.resourceBase.path, '../../assets/template.txt')
  assert.ok(fs.existsSync(asset), 'relative asset reference must resolve inside the snapshot')
  const alphaView = manager.views().skills.find(function (s) { return s.name === 'alpha-skill' })
  assert.equal(alpha.locator.name, 'alpha-skill')
  assert.equal(alpha.locator.relPath, 'plugins/alpha/skills/alpha-skill')
  assert.equal(alpha.locator.repoId, alphaView.repo.id)
  assert.ok(alpha.locator.repoId)
})

await check('definition returns parsed content and the same resourceBase', async () => {
  const candidate = provider.list().find(function (c) { return c.name === 'alpha-skill' })
  const definition = await provider.get(candidate)
  assert.equal(definition.name, 'alpha-skill')
  assert.equal(definition.provider, PROVIDER_NAME)
  assert.equal(definition.rank, PROVIDER_RANK)
  assert.equal(definition.resourceBase.path, candidate.resourceBase.path)
  assert.match(definition.content, /# Alpha body/)
  assert.equal(definition.path, candidate.path)
})

await check('disable removes the skill from the catalog and invalidates', async () => {
  await manager.toggleSkill('alpha-skill', false)
  assert.equal(control.invalidations, 1, 'toggle must invalidate exactly once')
  const names = provider.list().map(function (c) { return c.name })
  assert.deepEqual(names, ['beta-skill'])
  const stale = {
    name: 'alpha-skill',
    locator: { name: 'alpha-skill', repoId: imported.repo, relPath: 'plugins/alpha/skills/alpha-skill' }
  }
  const definition = await provider.get(stale)
  assert.equal(definition, undefined, 'definition for a disabled skill must be undefined')
})

await check('re-enable restores the skill and invalidates again', async () => {
  await manager.toggleSkill('alpha-skill', true)
  assert.equal(control.invalidations, 2)
  const names = provider.list().map(function (c) { return c.name }).sort()
  assert.deepEqual(names, ['alpha-skill', 'beta-skill'])
})

await check('bulk none/all keeps the catalog in sync', async () => {
  await manager.bulkSkills('none')
  assert.equal(control.invalidations, 3)
  assert.equal(provider.list().length, 0)
  await manager.bulkSkills('all')
  assert.equal(control.invalidations, 4)
  assert.equal(provider.list().length, 2)
})

await check('unknown candidate yields no definition', async () => {
  assert.equal(await provider.get({ locator: { name: 'missing-skill' } }), undefined)
  assert.equal(await provider.get(null), undefined)
})

await fsp.rm(home, { recursive: true, force: true })

if (problems.length) {
  console.error('provider tests failed:')
  for (const problem of problems) console.error(' - ' + problem)
  process.exit(1)
}
console.log('provider contract ok: 7 checks passed')
