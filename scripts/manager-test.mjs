#!/usr/bin/env node
// Offline integration test for the skills manager: temp DSH_HOME, local fixture
// repository (no network, no git required), provider contract, toggles, updates.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'dsh-skills-test-'))
process.env.DSH_HOME = home

const { createManager } = await import('../lib/manager.js')
const { PROVIDER_NAME, PROVIDER_RANK } = await import('../lib/provider.js')

const problems = []
async function check(name, fn) {
  try { await fn() } catch (error) { problems.push(name + ': ' + String((error && error.stack) || error)) }
}

function writeSkill(dir, frontmatter, body) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\n' + frontmatter + '\n---\n\n' + body + '\n', 'utf8')
}

const repo = path.join(home, 'fixture-repo')
writeSkill(path.join(repo, 'plugins', 'alpha', 'skills', 'alpha-skill'),
  'name: alpha-skill\ndescription: Alpha skill for tests\n',
  '# Alpha\n\nRead ../../assets/template.txt then continue.')
fs.mkdirSync(path.join(repo, 'plugins', 'alpha', 'assets'), { recursive: true })
fs.writeFileSync(path.join(repo, 'plugins', 'alpha', 'assets', 'template.txt'), 'template', 'utf8')
writeSkill(path.join(repo, 'plugins', 'alpha', 'skills', 'check'),
  'name: check\ndescription: Alpha check skill\n',
  '# Check alpha')
writeSkill(path.join(repo, 'plugins', 'beta', 'skills', 'check'),
  'name: check\ndescription: Beta check skill\n',
  '# Check beta')
writeSkill(path.join(repo, 'plugins', 'beta', 'skills', 'router'),
  'name: router\ndescription: Beta router skill\n',
  '# Router')
writeSkill(path.join(repo, 'plugins', 'gamma', 'skills', 'manual-only'),
  'name: manual-only\ndescription: Manual only skill\ndisable-model-invocation: true\n',
  '# Manual')
writeSkill(path.join(repo, 'broken'),
  'name: Bad Name\ndescription: ',
  '# broken')
fs.mkdirSync(path.join(repo, 'node_modules', 'nope'), { recursive: true })
fs.writeFileSync(path.join(repo, 'node_modules', 'nope', 'SKILL.md'), '---\nname: ignored\ndescription: nested\n---\n', 'utf8')
fs.mkdirSync(path.join(repo, 'deep', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'), { recursive: true })
writeSkill(path.join(repo, 'deep', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'),
  'name: too-deep\ndescription: Should not be found\n', '# too deep')

const manager = createManager(null, {})
await manager.ready

let scan = null
await check('scan local repository', async () => {
  scan = await manager.scanSource({ url: repo })
  assert.equal(scan.ok, true)
  assert.ok(scan.commit === null)
  assert.ok(scan.skills.length >= 5, 'expected at least 5 skills, got ' + scan.skills.length)
  const byRel = new Map(scan.skills.map(function (s) { return [s.relPath, s] }))
  const alpha = byRel.get('plugins/alpha/skills/alpha-skill')
  assert.ok(alpha && alpha.valid, 'alpha should be valid')
  const dupes = scan.skills.filter(function (s) { return s.duplicate })
  assert.equal(dupes.length, 1, 'one duplicate expected')
  assert.equal(dupes[0].suggestedName, 'beta-check')
  const broken = byRel.get('broken')
  assert.ok(broken && broken.valid === false, 'broken skill must be invalid')
  const manual = byRel.get('plugins/gamma/skills/manual-only')
  assert.equal(manual.invocation.modelInvocable, false)
  assert.ok(!scan.skills.some(function (s) { return s.name === 'ignored' }), 'node_modules must be skipped')
  assert.ok(!scan.skills.some(function (s) { return s.name === 'too-deep' }), 'depth cap must skip deep skills')
})

await check('import selected skills', async () => {
  const selected = scan.skills.filter(function (s) { return s.valid }).map(function (s) { return { relPath: s.relPath, name: s.suggestedName } })
  const result = await manager.commitImport({ scanId: scan.scanId, skills: selected })
  assert.equal(result.ok, true)
  assert.deepEqual(result.installed.slice().sort(), ['alpha-skill', 'beta-check', 'check', 'manual-only', 'router'].sort())
  assert.equal(result.skipped.length, 0)
})

await check('views expose effective names and provider state', async () => {
  const views = manager.views()
  assert.equal(views.summary.total, 5)
  assert.equal(views.summary.enabled, 5)
  assert.equal(views.provider.registered, false)
  const router = views.skills.find(function (s) { return s.name === 'router' })
  assert.ok(router)
  assert.equal(router.sourceName, 'router')
  assert.equal(router.renamed, false)
  assert.ok(router.repo.updateAvailable === false)
})

await check('provider candidates and definitions', async () => {
  const candidates = manager.providerCandidates()
  assert.equal(candidates.length, 5)
  const alpha = candidates.find(function (c) { return c.name === 'alpha-skill' })
  assert.equal(alpha.provider, PROVIDER_NAME)
  assert.equal(alpha.source, 'dsh-skills-tools')
  assert.equal(alpha.rank, PROVIDER_RANK)
  assert.equal(alpha.resourceBase.kind, 'directory')
  assert.ok(fs.existsSync(alpha.resourceBase.path))
  assert.ok(fs.existsSync(path.join(alpha.resourceBase.path, '..', '..', 'assets', 'template.txt')))
  const def = await manager.providerDefinition(alpha)
  assert.equal(def.name, 'alpha-skill')
  assert.ok(def.content.includes('# Alpha'))
  const manual = candidates.find(function (c) { return c.name === 'manual-only' })
  assert.equal(manual.invocation.modelInvocable, false)
})

await check('toggle filters the provider and invalidates', async () => {
  let invalidations = 0
  const fakeCtx = { skills: { registerProvider: function (create) {
    const control = { invalidate: function () { invalidations += 1 }, signal: undefined }
    create(control)
    return function () {}
  } } }
  assert.equal(manager.attachSkills(fakeCtx), true)
  assert.equal(manager.views().provider.registered, true)
  await manager.toggleSkill('manual-only', false)
  assert.equal(manager.providerCandidates().length, 4)
  assert.ok(invalidations >= 1)
  await manager.toggleSkill('manual-only', true)
  assert.equal(manager.providerCandidates().length, 5)
})

await check('bulk actions', async () => {
  const none = await manager.bulkSkills('none')
  assert.equal(none.ok, true)
  assert.equal(manager.providerCandidates().length, 0)
  const all = await manager.bulkSkills('all')
  assert.equal(all.ok, true)
  assert.equal(manager.providerCandidates().length, 5)
  const invert = await manager.bulkSkills('invert')
  assert.equal(invert.ok, true)
  assert.equal(manager.providerCandidates().length, 0)
  await manager.bulkSkills('all')
  await assert.rejects(async function () { await manager.bulkSkills('bogus') }, /未知的批量操作/)
})

await check('content route returns SKILL.md text', async () => {
  const content = await manager.content('alpha-skill')
  assert.equal(content.ok, true)
  assert.ok(content.content.includes('name: alpha-skill'))
})

await check('refresh reparses skills', async () => {
  const refreshed = await manager.refresh()
  assert.equal(refreshed.ok, true)
  assert.ok(refreshed.refreshed >= 5)
})

await check('repo grouping: inspect reports full availability', async () => {
  const repos = manager.views().repos
  assert.equal(repos.length, 1)
  assert.equal(repos[0].available, 5)
  const info = await manager.inspectRepo(repos[0].id)
  assert.equal(info.available, 5)
  assert.equal(info.imported, 5)
  assert.ok(info.skills.filter(function (s) { return s.valid }).every(function (s) { return s.imported }))
})

await check('repo grouping: partial import restores remaining skills', async () => {
  const repoId = manager.views().repos[0].id
  await manager.removeSkill('check')
  await manager.removeSkill('beta-check')
  const info = await manager.inspectRepo(repoId)
  assert.equal(info.imported, 3)
  const missing = info.skills.filter(function (s) { return !s.imported && s.valid })
  assert.equal(missing.length, 2)
  const added = await manager.importFromRepo({ repoId: repoId, skills: missing.map(function (s) { return { relPath: s.relPath, name: s.name } }) })
  assert.equal(added.installed.length, 2)
  assert.equal(manager.views().summary.total, 5)
  const again = await manager.inspectRepo(repoId)
  assert.ok(again.skills.filter(function (s) { return s.valid }).every(function (s) { return s.imported }))
  await assert.rejects(async function () { await manager.importFromRepo({ repoId: repoId, skills: [] }) }, /至少选择一个/)
})

await check('repo grouping: toggle whole repository', async () => {
  const repoId = manager.views().repos[0].id
  const off = await manager.toggleRepo(repoId, false)
  assert.equal(off.changed, 5)
  assert.equal(manager.providerCandidates().length, 0)
  const on = await manager.toggleRepo(repoId, true)
  assert.equal(on.changed, 5)
  assert.equal(manager.providerCandidates().length, 5)
  await assert.rejects(async function () { await manager.toggleRepo('repo_missing', true) }, /仓库不存在/)
})

await check('remove a skill and its empty repo', async () => {
  const before = manager.views().summary.total
  const removed = await manager.removeSkill('router')
  assert.equal(removed.ok, true)
  assert.equal(manager.views().summary.total, before - 1)
  await assert.rejects(async function () { await manager.removeSkill('router') }, /未找到 skill/)
})

await check('re-import is idempotent for the same repository', async () => {
  const again = await manager.scanSource({ url: repo })
  const selected = again.skills.filter(function (s) { return s.valid }).map(function (s) { return { relPath: s.relPath, name: s.suggestedName } })
  const result = await manager.commitImport({ scanId: again.scanId, skills: selected })
  assert.equal(result.ok, true)
  const names = manager.views().skills.map(function (s) { return s.name }).sort()
  assert.deepEqual(names, ['alpha-skill', 'beta-check', 'check', 'manual-only', 'router'].sort())
})

await check('update re-copies the local source', async () => {
  const skillFile = path.join(repo, 'plugins', 'alpha', 'skills', 'alpha-skill', 'SKILL.md')
  fs.writeFileSync(skillFile, '---\nname: alpha-skill\ndescription: Alpha updated description\n---\n\n# Alpha v2\n', 'utf8')
  const result = await manager.updateSkill('alpha-skill')
  assert.equal(result.ok, true)
  const view = manager.views().skills.find(function (s) { return s.name === 'alpha-skill' })
  assert.equal(view.description, 'Alpha updated description')
  const def = await manager.providerDefinition(manager.providerCandidates().find(function (c) { return c.name === 'alpha-skill' }))
  assert.ok(def.content.includes('# Alpha v2'))
})

await check('invalid selection is rejected', async () => {
  const again = await manager.scanSource({ url: repo })
  await assert.rejects(async function () {
    await manager.commitImport({ scanId: again.scanId, skills: [{ relPath: 'broken' }] })
  }, /没有可安装的 skill/)
  await assert.rejects(async function () {
    await manager.commitImport({ scanId: 'scan_missing', skills: [{ relPath: 'x' }] })
  }, /扫描结果已过期/)
})

await check('state file and lock hygiene', async () => {
  assert.ok(fs.existsSync(path.join(home, 'dsh-skills-tools', 'state.json')))
  assert.ok(!fs.existsSync(path.join(home, 'dsh-skills-tools', 'state.lock')))
  const state = JSON.parse(fs.readFileSync(path.join(home, 'dsh-skills-tools', 'state.json'), 'utf8'))
  assert.equal(state.version, 1)
  assert.equal(state.skills.length, 5)
})

manager.dispose()
await fsp.rm(home, { recursive: true, force: true })

if (problems.length > 0) {
  console.error('manager test failed:')
  for (const p of problems) console.error(' - ' + p)
  process.exit(1)
}
console.log('manager test OK: 17 groups, provider contract + toggles + updates + idempotent re-import')
