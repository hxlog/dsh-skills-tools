// lib/index.js — cordis host entry for dsh-skills-tools.
// Registers a ctx.skills provider backed by the managed repository snapshots,
// and exposes the management API used by the Settings -> Skills client bundle.
import { createManager } from './manager.js'
import { registerRoutes } from './routes.js'

export const name = 'skills-manager'
export const inject = []

export function apply(ctx, config) {
  const manager = createManager(ctx, config || {})
  manager.ready.catch(function (error) {
    manager.log.push('error', null, '初始化失败：' + String((error && error.message) || error))
  })

  ctx.effect(function () {
    return function () { manager.dispose() }
  }, 'skills-manager: dispose')

  ctx.inject(['skills'], function (skillsCtx) {
    manager.attachSkills(skillsCtx)
  })

  ctx.inject(['webServer'], function (webCtx) {
    ctx.inject(['connection'], function (connCtx) {
      try {
        const disposeRoutes = registerRoutes(webCtx.webServer, connCtx.connection, manager)
        ctx.effect(function () { return disposeRoutes }, 'skills-manager: routes')
      } catch (error) {
        manager.log.push('error', null, '管理接口注册失败：' + String((error && error.message) || error))
      }
    })
  })

  return { manager: manager, ready: manager.ready }
}
