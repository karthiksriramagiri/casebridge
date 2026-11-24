/* Resolves the "@/..." paths from tsconfig when tests run under plain node.

   Next resolves them through its bundler; `node --test` has no idea what they
   mean, so a test importing anything that reaches lib/pay would die on
   ERR_MODULE_NOT_FOUND. This maps them back to the repo root and supplies the
   .ts extension the source omits. */
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Try each extension TypeScript would have supplied, in source order. */
function withExtension(target) {
  if (path.extname(target)) return target
  for (const candidate of [`${target}.ts`, `${target}.tsx`, path.join(target, 'index.ts')]) {
    if (existsSync(candidate)) return candidate
  }
  return target
}

export function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    return next(pathToFileURL(withExtension(path.join(root, specifier.slice(2)))).href, context)
  }

  /* A source file importing a sibling writes './dates', not './dates.ts' —
     tsc fills the extension in and node does not. Only reached for files
     under this repo, so nothing in node_modules is touched. */
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    if (!path.extname(specifier) && context.parentURL?.startsWith('file:')) {
      const target = withExtension(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier))
      if (path.extname(target)) return next(pathToFileURL(target).href, context)
    }
  }

  return next(specifier, context)
}
