#!/usr/bin/env node
// Inline client/ui.css into the classic-script bundle and syntax-check it.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const css = fs.readFileSync(path.join(root, 'client', 'ui.css'), 'utf8')
const src = fs.readFileSync(path.join(root, 'client', 'client.src.js'), 'utf8')
const marker = '__SKM_CSS__'
if (src.split(marker).length !== 2) throw new Error('client.src.js must contain exactly one ' + marker + ' marker')
const out = src.replace(marker, JSON.stringify(css))
new vm.Script(out, { filename: 'client/client.js' })
fs.writeFileSync(path.join(root, 'client', 'client.js'), out)
console.log('client/client.js built (' + String(out.length) + ' bytes, css ' + String(css.length) + ' bytes)')
