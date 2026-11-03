// lib/frontmatter.js — tolerant SKILL.md frontmatter reader.
// Reads the small YAML subset that Agent Skills actually uses (string scalars,
// quoted strings, block scalars, booleans) without a YAML dependency. Unknown
// keys are ignored on purpose: DSH owns the authoritative parse.
export const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const LEGACY_KEYS = ['disableModelInvocation', 'modelInvocable', 'userInvocable']

function stripQuotes(text) {
  const value = text.trim()
  if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') {
    try { return JSON.parse(value) } catch (error) { return value.slice(1, -1) }
  }
  if (value.length >= 2 && value[0] === "'" && value[value.length - 1] === "'") {
    return value.slice(1, -1).replace(/''/g, "'")
  }
  return value
}

function parseBoolean(value, key) {
  const text = String(value).trim().toLowerCase()
  if (text === 'true' || text === 'yes' || text === 'on' || text === '1') return true
  if (text === 'false' || text === 'no' || text === 'off' || text === '0') return false
  throw new Error('frontmatter 字段 "' + key + '" 必须是布尔值')
}

function leadingSpaces(line) {
  const match = /^( *)/.exec(line)
  return match ? match[1].length : 0
}

function isSkippable(line) {
  const trimmed = line.trim()
  return trimmed === '' || trimmed.startsWith('#')
}

// Parse the YAML block; top-level keys only. Returns { data, errors }.
export function parseFrontmatterBlock(lines) {
  const data = {}
  const errors = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    i += 1
    if (leadingSpaces(line) !== 0 || isSkippable(line) || line.trim() === '---') continue
    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (!match) { errors.push('无法解析 frontmatter 行：' + line.slice(0, 120)); continue }
    const key = match[1]
    let raw = match[2]
    let value = ''
    const blockMatch = /^([|>])([+-]?)\s*$/.exec(raw)
    if (blockMatch) {
      const literal = blockMatch[1] === '|'
      const chomp = blockMatch[2]
      const collected = []
      while (i < lines.length) {
        const next = lines[i]
        if (next.trim() === '' || leadingSpaces(next) > 0) { collected.push(next); i += 1; continue }
        break
      }
      let indent = Infinity
      for (const item of collected) {
        if (item.trim() === '') continue
        indent = Math.min(indent, leadingSpaces(item))
      }
      if (!Number.isFinite(indent)) indent = 0
      const body = collected.map(function (item) { return item.trim() === '' ? '' : item.slice(indent) })
      value = literal ? body.join('\n') : body.join(' ').replace(/[ \t]+/g, ' ')
      if (chomp === '-') value = value.replace(/\s+$/, '')
      else if (chomp === '+') value = value + '\n'
      else value = value.replace(/\s+$/, '')
    } else {
      raw = raw.trim()
      if (raw === '') {
        // Nested mapping (e.g. metadata:) or an empty scalar. Consume the block.
        const nested = []
        while (i < lines.length) {
          const next = lines[i]
          if (next.trim() === '' || leadingSpaces(next) > 0) { nested.push(next); i += 1; continue }
          break
        }
        const hasContent = nested.some(function (item) { return item.trim() !== '' })
        value = hasContent ? null : ''
      } else if (raw.startsWith('[') || raw.startsWith('{')) {
        value = raw
      } else {
        value = stripQuotes(raw)
      }
    }
    if (LEGACY_KEYS.indexOf(key) >= 0) {
      errors.push('frontmatter 字段 "' + key + '" 不受支持，请改用 disable-model-invocation / user-invocable')
      continue
    }
    data[key] = value
  }
  return { data: data, errors: errors }
}

export function parseSkillText(raw) {
  let text = String(raw)
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = text.split('\n')
  if (lines[0] !== '---') {
    return { ok: false, error: 'SKILL.md 缺少 frontmatter（首行必须是 ---）' }
  }
  let closing = -1
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === '---' || lines[i] === '...') { closing = i; break }
  }
  if (closing < 0) return { ok: false, error: 'SKILL.md 的 frontmatter 没有结束标记 ---' }
  const parsed = parseFrontmatterBlock(lines.slice(1, closing))
  if (parsed.errors.length > 0) return { ok: false, error: parsed.errors[0] }
  const data = parsed.data
  const name = typeof data.name === 'string' ? data.name.trim() : ''
  if (!name) return { ok: false, error: 'frontmatter 缺少 name' }
  if (!SKILL_NAME_RE.test(name)) {
    return { ok: false, error: 'skill 名称不合法（仅小写字母、数字、单个连字符）：' + name }
  }
  const description = typeof data.description === 'string' ? data.description.trim() : ''
  if (!description) return { ok: false, error: 'frontmatter 缺少 description' }
  const whenToUse = typeof data.whenToUse === 'string' && data.whenToUse.trim() ? data.whenToUse.trim() : ''
  let modelInvocable = true
  let userInvocable = true
  try {
    if (data['disable-model-invocation'] !== undefined && data['disable-model-invocation'] !== null) {
      modelInvocable = !parseBoolean(data['disable-model-invocation'], 'disable-model-invocation')
    }
    if (data['user-invocable'] !== undefined && data['user-invocable'] !== null) {
      userInvocable = parseBoolean(data['user-invocable'], 'user-invocable')
    }
  } catch (error) {
    return { ok: false, error: error.message }
  }
  const content = lines.slice(closing + 1).join('\n').replace(/^\n+/, '')
  return {
    ok: true,
    name: name,
    description: description,
    whenToUse: whenToUse || undefined,
    invocation: { modelInvocable: modelInvocable, userInvocable: userInvocable },
    metadata: data.metadata && typeof data.metadata === 'object' ? data.metadata : undefined,
    content: content,
    bodyLines: closing + 1
  }
}
