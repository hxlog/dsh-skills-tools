#!/usr/bin/env node
// Marketplace listing consistency: README/package/docs must agree on version,
// install command and feature claims before publishing.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dsh-package.json'), 'utf8'))
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
const readmeEn = fs.readFileSync(path.join(root, 'README.en.md'), 'utf8')
const release = fs.readFileSync(path.join(root, 'docs', 'release-notes-v1.0.0.md'), 'utf8')
const marketplace = fs.readFileSync(path.join(root, 'docs', 'MARKETPLACES.md'), 'utf8')

const problems = []
function check(name, fn) {
  try { fn() } catch (error) { problems.push(name + ': ' + String((error && error.message) || error)) }
}

check('version appears consistently', function () {
  assert.ok(readme.includes(pkg.version), 'README.md must mention ' + pkg.version)
  assert.ok(release.includes(pkg.version), 'release notes must mention ' + pkg.version)
  assert.equal(manifest.version, pkg.version)
})

check('install instructions exist', function () {
  for (const text of [readme, readmeEn]) {
    assert.match(text, /dsh plugin add dsh-skills-tools/)
    assert.match(text, /Settings\s*(→|->)\s*Skills|设置\s*→\s*技能/)
  }
})

check('marketplace keywords and description', function () {
  for (const keyword of ['dsh-plugin', 'skills', 'agent-skills']) {
    assert.ok(pkg.keywords.includes(keyword), 'missing keyword ' + keyword)
  }
  assert.ok(pkg.description.length >= 40)
  assert.ok(marketplace.includes('Cursor'))
  assert.ok(marketplace.includes('project-docs-generate'))
})

check('screenshots are referenced or pending', function () {
  const shots = ['skills-list.png', 'import-scan.png', 'skill-detail.png']
  const dir = path.join(root, 'docs', 'screenshots')
  for (const shot of shots) {
    const referenced = marketplace.includes(shot)
    const present = fs.existsSync(path.join(dir, shot))
    assert.ok(referenced || present, shot + ' is neither referenced nor present')
  }
})

check('listing copy has both languages', function () {
  assert.ok(marketplace.includes('标题：DSH Skills Tools'))
  assert.ok(marketplace.includes('Title: DSH Skills Tools'))
  assert.ok(fs.existsSync(path.join(root, 'LICENSE')))
})

if (problems.length > 0) {
  console.error('verify:listings failed:')
  for (const problem of problems) console.error(' - ' + problem)
  process.exit(1)
}
console.log('verify:listings OK: version, install, keywords, screenshots, bilingual copy')
