#!/usr/bin/env node
/**
 * Starts the production server with .env.local loaded.
 *
 * `next start` does not pick up .env.local here the way `next dev` does — the
 * dev banner lists "Environments: .env.local" and the production one does not —
 * so runtime-only secrets (anything not NEXT_PUBLIC_, which is inlined at build
 * time) come back undefined and Supabase rejects the request with
 * "Unregistered API key".
 *
 * Also strips the surrounding quotes and literal \n escapes that some values in
 * this particular .env.local carry.
 *
 * Usage: node scripts/start-prod.mjs [-p 3000]
 */
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'

const text = readFileSync('.env.local', 'utf8')
const env = { ...process.env }
let loaded = 0

for (const line of text.split('\n')) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
  if (!m) continue
  let [, key, value] = m
  value = value.trim()
  const doubleQuoted = value.startsWith('"') && value.endsWith('"') && value.length > 1
  const singleQuoted = value.startsWith("'") && value.endsWith("'") && value.length > 1
  if (doubleQuoted || singleQuoted) value = value.slice(1, -1)
  // Match dotenv: escapes are expanded inside double quotes only. Getting this
  // wrong would change behaviour for anything else reading these vars — the
  // Google Sheets PEM key in here depends on real newlines.
  if (doubleQuoted) value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t')
  env[key] = value
  loaded++
}

console.log(`[start-prod] loaded ${loaded} vars from .env.local`)
for (const required of ['SUPABASE_SERVICE_ROLE_KEY', 'DEEPGRAM_API_KEY', 'ANTHROPIC_API_KEY']) {
  if (!env[required]) console.warn(`[start-prod] WARNING: ${required} is missing`)
}

const args = process.argv.slice(2)
spawn('npx', ['next', 'start', ...args], { env, stdio: 'inherit' })
