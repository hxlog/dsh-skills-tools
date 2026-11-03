// lib/util.js — paths, atomic state IO, locking, event log, small helpers.
// Zero third-party imports: this module must load in any DSH host.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

export const STATE_VERSION = 1

export function dshHome() {
  const fromEnv = process.env.DSH_HOME
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : path.join(os.homedir(), '.dsh')
}

export function managerDir() {
  return path.join(dshHome(), 'dsh-skills-tools')
}

export function reposDir() {
  return path.join(managerDir(), 'repos')
}

export function tmpDir() {
  return path.join(managerDir(), 'tmp')
}

export function statePath() {
  return path.join(managerDir(), 'state.json')
}

export function logsPath() {
  return path.join(managerDir(), 'logs.jsonl')
}

export function ensureDir() {
  fs.mkdirSync(managerDir(), { recursive: true })
  fs.mkdirSync(reposDir(), { recursive: true })
  fs.mkdirSync(tmpDir(), { recursive: true })
}

export function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex')
}

export function newId(prefix) {
  return String(prefix || 'id_') + crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

export function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

export function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms) })
}

export function errorText(error) {
  if (!error) return '未知错误'
  return String((error && error.message) || error)
}

export function asString(value, fallback) {
  return typeof value === 'string' ? value : (fallback === undefined ? '' : fallback)
}

export function asBool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

export function toPosix(rel) {
  return String(rel).split(path.sep).join('/')
}

export function isInside(parent, child) {
  const base = path.resolve(parent)
  const target = path.resolve(child)
  if (target === base) return true
  return target.startsWith(base + path.sep)
}

export function safeSlug(text) {
  return String(text)
    .replace(/^[a-zA-Z]+:\/\//, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80) || 'source'
}

export function atomicWriteJson(file, value) {
  const text = JSON.stringify(value, null, 2) + '\n'
  const temp = file + '.tmp-' + process.pid + '-' + Date.now()
  fs.writeFileSync(temp, text, 'utf8')
  fs.renameSync(temp, file)
  return sha256(text)
}

export function readJson(file, fallback) {
  try {
    const text = fs.readFileSync(file, 'utf8')
    return JSON.parse(text)
  } catch (error) {
    return fallback
  }
}

// Atomic cross-process mutation lock: mkdir succeeds for exactly one process.
export async function withLock(lockPath, work, options) {
  const opts = options || {}
  const timeoutMs = opts.timeoutMs || 20000
  const staleMs = opts.staleMs || 60000
  const started = Date.now()
  let acquired = false
  while (!acquired) {
    try {
      fs.mkdirSync(lockPath)
      fs.writeFileSync(path.join(lockPath, 'owner'), String(process.pid) + ' ' + String(Date.now()), 'utf8')
      acquired = true
      break
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw error
      let stale = false
      try {
        const stat = fs.statSync(lockPath)
        stale = Date.now() - stat.mtimeMs > staleMs
      } catch (ignored) {
        stale = true
      }
      if (stale) {
        try { fs.rmSync(lockPath, { recursive: true, force: true }) } catch (ignored) {}
        continue
      }
      if (Date.now() - started > timeoutMs) throw new Error('另一个操作正在进行，请稍后重试')
      await sleep(40)
    }
  }
  try {
    return await work()
  } finally {
    try { fs.rmSync(lockPath, { recursive: true, force: true }) } catch (ignored) {}
  }
}

export function createEventLog(limit) {
  const capacity = limit || 300
  const ring = []
  let fileWarned = false
  function append(entry) {
    const item = {
      at: Number(entry.at) || Date.now(),
      level: entry.level === 'warn' || entry.level === 'error' ? entry.level : 'info',
      skill: entry.skill || null,
      message: String(entry.message || '')
    }
    ring.push(item)
    if (ring.length > capacity) ring.shift()
    try {
      ensureDir()
      fs.appendFileSync(logsPath(), JSON.stringify(item) + '\n', 'utf8')
    } catch (error) {
      fileWarned = true
    }
    return item
  }
  return {
    push: function (level, skill, message) { return append({ level: level, skill: skill, message: message }) },
    list: function (size) {
      const n = Math.max(1, Math.min(capacity, Number(size) || 100))
      return ring.slice(Math.max(0, ring.length - n))
    }
  }
}
