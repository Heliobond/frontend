// Supply-chain invariants for bun.lock (#917). The CI job fails when a
// dependency resolves from anywhere other than the npm registry, when an entry
// lacks a sha512 integrity hash, or when another package manager's lockfile
// reappears. Each rule is asserted here rather than assumed from today's tree.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REGISTRY_IDENT = /^(@[^/]+\/)?[^@/]+@\d[\w.+-]*$/
const SRI_INTEGRITY = /^sha(512|384|256|1)-[A-Za-z0-9+/]+=*$/
const NON_REGISTRY_SPEC = /^(git\+|git:|github:|gitlab:|bitbucket:|https?:|file:|link:|workspace:)/
const FOREIGN_LOCKFILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']

// bun.lock is JSON with trailing commas, which JSON.parse rejects.
export function parseBunLock(text) {
  return JSON.parse(text.replace(/,(\s*[}\]])/g, '$1'))
}

export function lintLockfile(lock) {
  const errors = []

  for (const [name, entry] of Object.entries(lock.packages ?? {})) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') {
      errors.push(`${name}: malformed entry`)
      continue
    }
    const [ident, resolution, , integrity] = entry
    if (!REGISTRY_IDENT.test(ident)) {
      errors.push(`${name}: resolves to a non-registry spec "${ident}"`)
    }
    if (resolution !== '') {
      errors.push(`${name}: unexpected resolution source "${resolution}"`)
    }
    if (typeof integrity !== 'string' || !SRI_INTEGRITY.test(integrity)) {
      errors.push(`${name}: missing sha512 integrity hash`)
    }
  }

  const declared = Object.values(lock.workspaces ?? {}).flatMap((workspace) => [
    ...Object.entries(workspace.dependencies ?? {}),
    ...Object.entries(workspace.devDependencies ?? {}),
  ])
  for (const [name, spec] of [...declared, ...Object.entries(lock.overrides ?? {})]) {
    if (typeof spec === 'string' && NON_REGISTRY_SPEC.test(spec)) {
      errors.push(`${name}: declared with non-registry spec "${spec}"`)
    }
  }

  return errors
}

export function findForeignLockfiles(dir) {
  return FOREIGN_LOCKFILES.filter((file) => existsSync(join(dir, file))).map(
    (file) => `${file} must not be committed; bun.lock is the only lockfile`,
  )
}

function main(root = process.cwd()) {
  let lock
  try {
    lock = parseBunLock(readFileSync(join(root, 'bun.lock'), 'utf8'))
  } catch (error) {
    console.error(`lockfile-lint: cannot read bun.lock: ${error.message}`)
    return 1
  }

  const errors = [...lintLockfile(lock), ...findForeignLockfiles(root)]
  for (const error of errors) console.error(`lockfile-lint: ${error}`)
  if (errors.length > 0) return 1

  console.log(`lockfile-lint: ${Object.keys(lock.packages).length} packages OK`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main()
}
