// lib/state.js — schema, normalisation and atomic reads of state.json.
import fs from 'node:fs'
import { STATE_VERSION, atomicWriteJson, ensureDir, readJson, statePath } from './util.js'

const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function defaultState() {
  return { version: STATE_VERSION, repos: [], skills: [] }
}

function asString(value) { return typeof value === 'string' ? value : '' }
function asNumber(value) { return Number.isFinite(Number(value)) ? Number(value) : 0 }

function normalizeRepo(input) {
  const repo = input || {}
  return {
    id: asString(repo.id),
    url: asString(repo.url),
    kind: repo.kind === 'local' ? 'local' : 'git',
    ref: asString(repo.ref),
    commit: asString(repo.commit) || null,
    snapshot: asString(repo.snapshot),
    files: asNumber(repo.files),
    bytes: asNumber(repo.bytes),
    createdAt: asNumber(repo.createdAt) || Date.now(),
    updatedAt: asNumber(repo.updatedAt) || Date.now(),
    checkedAt: asNumber(repo.checkedAt) || 0,
    latestCommit: asString(repo.latestCommit) || null,
    lastError: asString(repo.lastError) || null,
    available: asNumber(repo.available) || null
  }
}

function normalizeInvocation(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  return {
    modelInvocable: value.modelInvocable !== false,
    userInvocable: value.userInvocable !== false
  }
}

function normalizeSkill(input) {
  const skill = input || {}
  return {
    name: asString(skill.name),
    sourceName: asString(skill.sourceName) || asString(skill.name),
    description: asString(skill.description),
    whenToUse: asString(skill.whenToUse) || undefined,
    invocation: normalizeInvocation(skill.invocation),
    repoId: asString(skill.repoId),
    relPath: asString(skill.relPath),
    enabled: skill.enabled !== false,
    files: asNumber(skill.files),
    bytes: asNumber(skill.bytes),
    importedAt: asNumber(skill.importedAt) || Date.now(),
    updatedAt: asNumber(skill.updatedAt) || Date.now(),
    lastError: asString(skill.lastError) || null
  }
}

export function normalizeState(raw) {
  const parsed = raw && typeof raw === 'object' ? raw : {}
  const repos = Array.isArray(parsed.repos) ? parsed.repos.map(normalizeRepo).filter(function (repo) { return repo.id && repo.url }) : []
  const repoIds = new Set(repos.map(function (repo) { return repo.id }))
  const seen = new Set()
  const skills = []
  for (const item of Array.isArray(parsed.skills) ? parsed.skills : []) {
    const skill = normalizeSkill(item)
    if (!SKILL_NAME_RE.test(skill.name)) continue
    if (!skill.repoId || !repoIds.has(skill.repoId)) continue
    if (seen.has(skill.name)) continue
    seen.add(skill.name)
    skills.push(skill)
  }
  return { version: STATE_VERSION, repos: repos, skills: skills }
}

export function loadState() {
  ensureDir()
  return normalizeState(readJson(statePath(), defaultState()))
}

export function saveState(next) {
  ensureDir()
  const state = normalizeState(next)
  atomicWriteJson(statePath(), state)
  return state
}

export function stateMtime() {
  try { return fs.statSync(statePath()).mtimeMs } catch (error) { return 0 }
}
