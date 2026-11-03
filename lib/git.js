// lib/git.js — Git transport through the user's own git credentials.
// We never store tokens: private/intranet repositories work because the local
// git credential helper / SSH agent already has access. Prompts are disabled so
// a missing credential fails fast instead of hanging the settings page.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { safeSlug } from './util.js'

const DEFAULT_TIMEOUT_MS = 120000
const MAX_OUTPUT = 512 * 1024

function childEnv() {
  const env = Object.assign({}, process.env)
  env.GIT_TERMINAL_PROMPT = '0'
  env.GCM_INTERACTIVE = 'never'
  return env
}

function killTree(child) {
  try { child.kill('SIGKILL') } catch (error) {}
  if (process.platform === 'win32' && child.pid) {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    } catch (error) {}
  }
}

export function runGit(args, options) {
  const opts = options || {}
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS
  return new Promise(function (resolve, reject) {
    const child = spawn('git', args, {
      cwd: opts.cwd || undefined,
      env: childEnv(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(function () {
      if (settled) return
      settled = true
      killTree(child)
      reject(new Error('git 操作超时（' + String(Math.round(timeoutMs / 1000)) + ' 秒）：' + args[0]))
    }, timeoutMs)
    if (timer.unref) timer.unref()
    child.stdout.on('data', function (chunk) {
      if (stdout.length < MAX_OUTPUT) stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', function (chunk) {
      if (stderr.length < MAX_OUTPUT) stderr += chunk.toString('utf8')
    })
    child.on('error', function (error) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error && error.code === 'ENOENT') {
        reject(new Error('未找到 git 命令。请先安装 Git，并确保它在 PATH 中。'))
        return
      }
      reject(error)
    })
    child.on('close', function (code) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code: code, stdout: stdout, stderr: stderr })
    })
  })
}

function friendlyCloneError(text) {
  const value = String(text || '')
  if (/Authentication failed|could not read Username|terminal prompts disabled|Permission denied|access denied|HTTP 401|HTTP 403/i.test(value)) {
    return 'Git 凭据不可用（需要该仓库的访问权限）。请先在本机完成 git 认证（credential helper / SSH key）后重试。'
  }
  if (/not found|Repository not found|HTTP 404/i.test(value)) {
    return '仓库不存在或无权访问：请检查 URL 与 ref。'
  }
  return ''
}

// Turn whatever the user pasted into a cloneable source descriptor.
export function resolveSource(input) {
  const raw = String((input && input.url) || '').trim()
  if (!raw) throw new Error('请填写仓库 URL 或本机目录')
  let ref = String((input && input.ref) || '').trim()
  let subdir = String((input && input.subdir) || '').trim().replace(/^\/+|\/+$/g, '')
  let url = raw

  // file:// URLs and plain local directories use the filesystem transport.
  if (/^file:\/\//i.test(raw)) {
    const localPath = fileURLToPath(raw)
    if (!fs.existsSync(localPath)) throw new Error('本机目录不存在：' + localPath)
    return { kind: 'local', localPath: localPath, url: localPath, ref: '', subdir: subdir }
  }
  if (isLocalPath(raw)) {
    return { kind: 'local', localPath: path.resolve(raw), url: path.resolve(raw), ref: '', subdir: subdir }
  }

  // Web URL forms with a tree path: host/owner/repo/tree/<ref>/<sub> or
  // GitLab's host/owner/repo/-/tree/<ref>/<sub>.
  let parsed
  try { parsed = new URL(raw) } catch (error) { parsed = null }
  if (parsed && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
    const segments = parsed.pathname.split('/').filter(Boolean)
    const treeIndex = segments.indexOf('tree')
    const dashTreeIndex = segments.indexOf('-') >= 0 ? segments.indexOf('tree') : -1
    if (treeIndex >= 3) {
      const baseSegments = segments.slice(0, treeIndex)
      const tail = segments.slice(treeIndex + 1)
      if (!ref && tail.length > 0) ref = tail[0]
      if (!subdir && tail.length > 1) subdir = tail.slice(1).join('/')
      url = parsed.origin + '/' + baseSegments.join('/')
    } else if (dashTreeIndex >= 3) {
      // handled by the same branch above; kept for readability
    }
    const hash = parsed.hash ? parsed.hash.replace(/^#/, '').trim() : ''
    if (!ref && hash) ref = hash
    parsed.hash = ''
    parsed.search = ''
    if (url === raw) url = parsed.toString().replace(/\/+$/, '')
  } else if (raw.indexOf('#') > 0) {
    const parts = raw.split('#')
    if (!ref) ref = parts.slice(1).join('#').trim()
    url = parts[0]
  }

  url = url.replace(/\/+$/, '')
  return { kind: 'git', url: url, ref: ref, subdir: subdir }
}

function isLocalPath(text) {
  if (/^[a-zA-Z]:[\\/]/.test(text)) return true
  if (text.startsWith('\\\\')) return true
  if (text.startsWith('./') || text.startsWith('.\\') || text.startsWith('../') || text.startsWith('..\\')) {
    return fs.existsSync(path.resolve(text))
  }
  if (text.startsWith('/') && !/^\/\/[^/]/.test(text)) return true
  if (!text.includes(':') && fs.existsSync(path.resolve(text))) return true
  return false
}

export async function cloneSource(source, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  if (source.kind === 'local') {
    return { commit: null, ref: 'local', dir: source.localPath || source.url }
  }
  const ref = source.ref
  const commitRef = /^[0-9a-f]{7,40}$/i.test(ref)
  const args = ['clone', '--depth', '1', '--no-tags', '--single-branch']
  if (ref && !commitRef) args.push('--branch', ref)
  args.push('--', source.url, destDir)
  let result = await runGit(args)
  if (result.code !== 0 && ref && !commitRef) {
    // A tag or a remote branch the shallow single-branch clone rejected.
    const retry = await runGit(['clone', '--depth', '1', '--no-tags', '--', source.url, destDir])
    if (retry.code !== 0) throw new Error(friendlyCloneError(result.stderr + retry.stderr) || ('克隆失败：' + (retry.stderr || result.stderr || '').trim().slice(-300)))
    result = retry
  }
  if (result.code !== 0) {
    throw new Error(friendlyCloneError(result.stderr) || ('克隆失败：' + String(result.stderr || '').trim().slice(-300)))
  }
  if (commitRef) {
    const fetch = await runGit(['fetch', '--depth', '1', 'origin', ref], { cwd: destDir })
    if (fetch.code !== 0) throw new Error('无法获取提交 ' + ref + '：' + String(fetch.stderr || '').trim().slice(-200))
    const checkout = await runGit(['checkout', '--detach', 'FETCH_HEAD'], { cwd: destDir })
    if (checkout.code !== 0) throw new Error('无法切换到提交 ' + ref + '：' + String(checkout.stderr || '').trim().slice(-200))
  }
  const head = await runGit(['rev-parse', 'HEAD'], { cwd: destDir })
  if (head.code !== 0) throw new Error('无法读取仓库提交信息')
  return { commit: head.stdout.trim(), ref: ref || 'HEAD', dir: destDir }
}

export async function remoteHead(source) {
  if (source.kind === 'local') return { commit: null, ref: 'local' }
  if (source.ref) {
    const direct = await runGit(['ls-remote', source.url, source.ref])
    const sha = firstSha(direct.stdout)
    if (sha) return { commit: sha, ref: source.ref }
    const branch = await runGit(['ls-remote', source.url, 'refs/heads/' + source.ref])
    const branchSha = firstSha(branch.stdout)
    if (branchSha) return { commit: branchSha, ref: source.ref }
    const tag = await runGit(['ls-remote', source.url, 'refs/tags/' + source.ref + '^{}'])
    const tagSha = firstSha(tag.stdout)
    if (tagSha) return { commit: tagSha, ref: source.ref }
    return { commit: null, ref: source.ref }
  }
  const head = await runGit(['ls-remote', '--symref', source.url, 'HEAD'])
  const refMatch = /ref:\s+(refs\/heads\/[^\s]+)\s+HEAD/.exec(head.stdout)
  return { commit: firstSha(head.stdout), ref: refMatch ? refMatch[1].replace('refs/heads/', '') : 'HEAD' }
}

function firstSha(text) {
  const match = /^([0-9a-f]{40})\s/m.exec(String(text || ''))
  return match ? match[1] : null
}

export function sourceSlug(source) {
  if (source.kind === 'local') return safeSlug(path.basename(source.localPath || source.url) || 'local')
  let label = source.url
  try {
    const parsed = new URL(source.url)
    label = parsed.host + parsed.pathname
  } catch (error) {}
  return safeSlug(label)
}
