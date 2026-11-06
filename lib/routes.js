// lib/routes.js — same-origin JSON routes under /skills-tools/api.
// Gated by the host connection service (Host/Origin fence + login cookie) so no
// other local process can drive the skills library without the session.
import { errorText } from './util.js'

const PREFIX = '/skills-tools/api'
const MAX_BODY_BYTES = 256 * 1024

function sendJson(response, status, payload) {
  if (response.headersSent) { try { response.end() } catch (error) {} return }
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(payload))
}

async function readJsonBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('请求体过大（上限 256 KiB）')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (!text) return {}
  try { return JSON.parse(text) } catch (error) { throw new Error('请求体不是合法 JSON：' + errorText(error)) }
}

function gate(connection, request, response) {
  if (!connection || typeof connection.requestRejection !== 'function') return false
  let rejection
  try { rejection = connection.requestRejection(request) } catch (error) { rejection = 403 }
  if (rejection === undefined) return false
  sendJson(response, rejection, { ok: false, error: rejection === 401 ? '需要登录后再操作' : '请求来源不可信' })
  return true
}

export function registerRoutes(webServer, connection, manager) {
  if (!webServer || typeof webServer.register !== 'function') throw new Error('webServer 服务不可用')
  const disposers = []

  function route(routePath, methods, handle) {
    const fullPath = PREFIX + routePath
    const handler = async function (request, response) {
      if (gate(connection, request, response)) return
      const method = String(request.method || 'GET').toUpperCase()
      if (methods.indexOf(method) < 0) {
        sendJson(response, 405, { ok: false, error: '不支持的请求方法：' + method })
        return
      }
      try {
        await manager.ready
        const body = method === 'GET' || method === 'HEAD' ? {} : await readJsonBody(request)
        const url = new URL('http://local' + (request.url || '/'))
        const result = await handle({ method: method, body: body, url: url, request: request })
        sendJson(response, 200, result)
      } catch (error) {
        sendJson(response, 400, { ok: false, error: errorText(error) })
      }
    }
    const dispose = webServer.register({ kind: 'exact', path: fullPath, handler: handler })
    disposers.push(dispose)
    return dispose
  }

  route('/state', ['GET'], async function () {
    return manager.views()
  })

  route('/logs', ['GET'], async function (context) {
    const limit = Number(context.url.searchParams.get('limit') || 100)
    return { ok: true, events: manager.events(limit) }
  })

  route('/import/scan', ['POST'], async function (context) {
    const body = context.body || {}
    return await manager.scanSource({ url: body.url, ref: body.ref, subdir: body.subdir })
  })

  route('/import/commit', ['POST'], async function (context) {
    return await manager.commitImport(context.body || {})
  })

  route('/skills/toggle', ['POST'], async function (context) {
    const body = context.body || {}
    if (!body.name) throw new Error('缺少 name')
    return await manager.toggleSkill(String(body.name), body.enabled !== false)
  })

  route('/skills/bulk', ['POST'], async function (context) {
    const body = context.body || {}
    return await manager.bulkSkills(String(body.action || ''))
  })

  route('/skills/remove', ['POST'], async function (context) {
    const body = context.body || {}
    if (!body.name) throw new Error('缺少 name')
    return await manager.removeSkill(String(body.name))
  })

  route('/skills/update', ['POST'], async function (context) {
    const body = context.body || {}
    if (!body.name) throw new Error('缺少 name')
    return await manager.updateSkill(String(body.name))
  })

  route('/skills/content', ['GET'], async function (context) {
    const name = context.url.searchParams.get('name') || ''
    if (!name) throw new Error('缺少 name')
    return await manager.content(name)
  })

  route('/repos/check-updates', ['POST'], async function () {
    return await manager.checkUpdates()
  })

  route('/repos/inspect', ['POST'], async function (context) {
    const body = context.body || {}
    if (!body.repoId) throw new Error('缺少 repoId')
    return await manager.inspectRepo(String(body.repoId))
  })

  route('/repos/update', ['POST'], async function (context) {
    const body = context.body || {}
    if (!body.repoId) throw new Error('缺少 repoId')
    return await manager.updateRepo(String(body.repoId))
  })

  route('/repos/import', ['POST'], async function (context) {
    return await manager.importFromRepo(context.body || {})
  })

  route('/repos/toggle', ['POST'], async function (context) {
    const body = context.body || {}
    if (!body.repoId) throw new Error('缺少 repoId')
    return await manager.toggleRepo(String(body.repoId), body.enabled !== false)
  })

  route('/refresh', ['POST'], async function () {
    return await manager.refresh()
  })

  return function disposeRoutes() {
    for (const dispose of disposers) { try { if (typeof dispose === 'function') dispose() } catch (error) {} }
  }
}
