/* Resolves the "@/..." paths from tsconfig when tests run under plain node.

   Next resolves them through its bundler; `node --test` has no idea what they
   mean, so a test importing anything that reaches lib/pay would die on
   ERR_MODULE_NOT_FOUND. This maps them back to the repo root and supplies the
   .ts extension the source omits. */
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function resolve(specifier, context, next) {
  if (!specifier.startsWith('@/')) return next(specifier, context)

  let target = path.join(root, specifier.slice(2))
  if (!path.extname(target)) {
    for (const candidate of [`${target}.ts`, `${target}.tsx`, path.join(target, 'index.ts')]) {
      if (existsSync(candidate)) { target = candidate; break }
    }
  }
  return next(pathToFileURL(target).href, context)
}
