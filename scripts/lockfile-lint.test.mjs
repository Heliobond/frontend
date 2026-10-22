import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findForeignLockfiles, lintLockfile, parseBunLock } from './lockfile-lint.mjs'

const SHA =
  'sha512-6OzddxPio9UiWTCemp4N8cYLV2ZN1ncRnV1cVGtve7dhPOtRkleRyx32GQCYSwDYgaHU3USMm84tNsvKzRCa1Q=='

function lockWith(packages, extra = {}) {
  return {
    lockfileVersion: 1,
    workspaces: { '': { name: 'app', dependencies: {} } },
    packages,
    ...extra,
  }
}

describe('lintLockfile', () => {
  it('accepts registry entries with sha512 integrity', () => {
    const lock = lockWith({ 'left-pad': ['left-pad@1.3.0', '', {}, SHA] })
    expect(lintLockfile(lock)).toEqual([])
  })

  it('rejects a git source', () => {
    const lock = lockWith({
      evil: ['evil@github:attacker/evil#abc123', '', {}, SHA],
    })
    expect(lintLockfile(lock)).toEqual([
      expect.stringContaining('evil: resolves to a non-registry spec'),
    ])
  })

  it('rejects a tarball URL source', () => {
    const lock = lockWith({
      evil: ['evil@https://example.com/evil-1.0.0.tgz', '', {}, SHA],
    })
    expect(lintLockfile(lock)).toEqual([
      expect.stringContaining('evil: resolves to a non-registry spec'),
    ])
  })

  it('rejects an entry with a non-empty resolution field', () => {
    const lock = lockWith({ pkg: ['pkg@1.0.0', 'https://mirror.example', {}, SHA] })
    expect(lintLockfile(lock)).toEqual([expect.stringContaining('unexpected resolution source')])
  })

  it('rejects an entry without an integrity hash', () => {
    const lock = lockWith({ pkg: ['pkg@1.0.0', '', {}] })
    expect(lintLockfile(lock)).toEqual([
      expect.stringContaining('pkg: missing sha512 integrity hash'),
    ])
  })

  it('rejects a malformed entry', () => {
    expect(lintLockfile(lockWith({ pkg: 'pkg@1.0.0' }))).toEqual([
      expect.stringContaining('pkg: malformed entry'),
    ])
  })

  it('rejects a workspace dependency declared with a git spec', () => {
    const lock = lockWith(
      {},
      {
        workspaces: {
          '': { name: 'app', dependencies: { helper: 'github:attacker/helper' } },
        },
      },
    )
    expect(lintLockfile(lock)).toEqual([
      expect.stringContaining('helper: declared with non-registry spec'),
    ])
  })

  it('rejects an override that points at a non-registry spec', () => {
    const lock = lockWith({}, { overrides: { axios: 'git+https://github.com/axios/axios.git' } })
    expect(lintLockfile(lock)).toEqual([
      expect.stringContaining('axios: declared with non-registry spec'),
    ])
  })

  it('passes the committed bun.lock', () => {
    const text = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'bun.lock'),
      'utf8',
    )
    expect(lintLockfile(parseBunLock(text))).toEqual([])
  })
})

describe('parseBunLock', () => {
  it('accepts trailing commas that JSON.parse rejects', () => {
    expect(parseBunLock('{"a": [1, 2,], "b": {"c": 3,},}')).toEqual({ a: [1, 2], b: { c: 3 } })
  })
})

describe('findForeignLockfiles', () => {
  let dir

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lockfile-lint-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports a package-lock.json that reappears', () => {
    writeFileSync(join(dir, 'package-lock.json'), '{}')
    expect(findForeignLockfiles(dir)).toEqual([
      expect.stringContaining('package-lock.json must not be committed'),
    ])
  })

  it('returns nothing when only bun.lock exists', () => {
    writeFileSync(join(dir, 'bun.lock'), '{}')
    expect(findForeignLockfiles(dir)).toEqual([])
  })
})
