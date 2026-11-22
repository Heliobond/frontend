import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The script is bash; skip where bash is unavailable (e.g. plain Windows).
const hasBash = spawnSync('bash', ['-c', 'true']).status === 0
const posix = (p) => p.replace(/\\/g, '/')
const scriptPath = posix(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'update-specs.sh'),
)

const OLD = {
  'investment_vault.spec.json': '{"old":"vault"}\n',
  'project_registry.spec.json': '{"old":"registry"}\n',
  COMMIT_SHA: 'oldsha0000000000000000000000000000000000\n',
}
const NEW_SHA = 'a'.repeat(40)

// A fake `stellar` CLI: prints a spec named after the wasm, or fails/empties on demand.
const FAKE_STELLAR = [
  '#!/usr/bin/env bash',
  'wasm=""',
  'while [ $# -gt 0 ]; do',
  '  if [ "$1" = "--wasm" ]; then wasm="$2"; fi',
  '  shift',
  'done',
  'name="$(basename "$wasm" .wasm)"',
  'if [ "$name" = "$FAIL_ON" ]; then',
  '  echo \'{"partial":\'',
  '  exit 1',
  'fi',
  'if [ "$name" = "$EMPTY_ON" ]; then exit 0; fi',
  'printf \'{"new":"%s"}\\n\' "$name"',
  '',
].join('\n')

describe.skipIf(!hasBash)('update-specs.sh staging (#1038)', () => {
  let root
  let outDir
  let wasmDir
  let binDir

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'update-specs-'))
    outDir = path.join(root, 'out')
    wasmDir = path.join(root, 'wasm')
    binDir = path.join(root, 'bin')
    for (const dir of [outDir, wasmDir, binDir]) fs.mkdirSync(dir)
    for (const [name, content] of Object.entries(OLD)) {
      fs.writeFileSync(path.join(outDir, name), content)
    }
    for (const wasm of ['investment_vault', 'project_registry']) {
      fs.writeFileSync(path.join(wasmDir, `${wasm}.wasm`), 'wasm')
    }
    fs.writeFileSync(path.join(binDir, 'stellar'), FAKE_STELLAR, { mode: 0o755 })
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  function run(env = {}) {
    return spawnSync('bash', [scriptPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${posix(binDir)}:${process.env.PATH}`,
        CONTRACTS_WASM_DIR: posix(wasmDir),
        CONTRACTS_COMMIT_SHA: NEW_SHA,
        OUT_DIR: posix(outDir),
        ...env,
      },
    })
  }

  const read = (name) => fs.readFileSync(path.join(outDir, name), 'utf8')
  const listing = () => fs.readdirSync(outDir).sort()

  function expectOriginalsIntact() {
    for (const [name, content] of Object.entries(OLD)) expect(read(name)).toBe(content)
  }

  it('updates both interfaces and records the matching revision on success', () => {
    const result = run()

    expect(result.status, result.stderr).toBe(0)
    expect(read('investment_vault.spec.json')).toBe('{"new":"investment_vault"}\n')
    expect(read('project_registry.spec.json')).toBe('{"new":"project_registry"}\n')
    expect(read('COMMIT_SHA')).toBe(`${NEW_SHA}\n`)
  })

  it('leaves no staging files behind after success', () => {
    run()
    expect(listing()).toEqual(Object.keys(OLD).sort())
  })

  it('refuses to publish if a destination is a directory', () => {
    const destination = path.join(outDir, 'project_registry.spec.json')
    fs.rmSync(destination)
    fs.mkdirSync(destination)

    const result = run()

    expect(result.status).not.toBe(0)
    expect(fs.readdirSync(destination)).toEqual([])
    expect(read('investment_vault.spec.json')).toBe(OLD['investment_vault.spec.json'])
    expect(read('COMMIT_SHA')).toBe(OLD.COMMIT_SHA)
  })

  it('preserves both fixtures and the revision file when the second export fails', () => {
    const result = run({ FAIL_ON: 'project_registry' })

    expect(result.status).not.toBe(0)
    expectOriginalsIntact()
    expect(listing()).toEqual(Object.keys(OLD).sort())
  })

  it('preserves everything when the first export fails', () => {
    const result = run({ FAIL_ON: 'investment_vault' })

    expect(result.status).not.toBe(0)
    expectOriginalsIntact()
  })

  it('refuses to publish an empty export and keeps the originals', () => {
    const result = run({ EMPTY_ON: 'project_registry' })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/empty/)
    expectOriginalsIntact()
  })

  it('creates the fixtures on a first run when none exist yet', () => {
    for (const name of Object.keys(OLD)) fs.rmSync(path.join(outDir, name))

    const result = run()

    expect(result.status, result.stderr).toBe(0)
    expect(read('COMMIT_SHA')).toBe(`${NEW_SHA}\n`)
    expect(listing()).toEqual(Object.keys(OLD).sort())
  })

  it('does not create partial fixtures on a first run that fails', () => {
    for (const name of Object.keys(OLD)) fs.rmSync(path.join(outDir, name))

    const result = run({ FAIL_ON: 'project_registry' })

    expect(result.status).not.toBe(0)
    expect(listing()).toEqual([])
  })
})
