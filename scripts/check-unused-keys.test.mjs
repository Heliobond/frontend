import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SCRIPT = path.join(process.cwd(), 'scripts', 'check-unused-keys.mjs')

/** Run the detector against a throwaway project so no repository files change. */
function runDetector({ catalog, sources, baseline = [] }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'unused-keys-'))
  try {
    fs.mkdirSync(path.join(root, 'messages'), { recursive: true })
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
    fs.writeFileSync(path.join(root, 'messages', 'en.json'), JSON.stringify(catalog))
    fs.writeFileSync(
      path.join(root, 'scripts', 'unused-keys-baseline.json'),
      JSON.stringify(baseline),
    )
    for (const [name, content] of Object.entries(sources)) {
      fs.writeFileSync(path.join(root, 'src', name), content)
    }
    const result = spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: 'utf-8' })
    return { status: result.status, output: `${result.stdout}${result.stderr}` }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

describe('check-unused-keys namespace scoping', () => {
  const catalog = {
    Alpha: { title: 'Alpha title' },
    Beta: { title: 'Beta title', typeSolar: 'Solar', typeWind: 'Wind' },
  }

  it('reports two namespaces with a title key independently', () => {
    const { status, output } = runDetector({
      catalog,
      sources: {
        'alpha.tsx': `const t = useTranslations('Alpha')\nt('title')\n`,
        'beta.tsx': `const t = useTranslations('Beta')\nt('typeSolar')\n`,
      },
    })
    expect(status).toBe(1)
    expect(output).toContain('Beta.title')
    expect(output).not.toContain('Alpha.title')
    expect(output).not.toContain('Alpha.h1')
  })

  it('keeps table-driven keys recognized inside their own namespace', () => {
    const { output } = runDetector({
      catalog,
      sources: {
        'alpha.tsx': `const t = useTranslations('Alpha')\nt('title')\n`,
        'beta.tsx': `const t = useTranslations('Beta')\nt(\`type\${pt}\`)\n`,
      },
    })
    expect(output).not.toContain('Beta.typeSolar')
    expect(output).not.toContain('Beta.typeWind')
  })

  it('does not let a quoted last segment mark keys in every namespace as used', () => {
    const { output } = runDetector({
      catalog,
      sources: {
        'alpha.tsx': `const t = useTranslations('Alpha')\nt('title')\n`,
        'mentions.ts': `export const label = 'title'\n`,
      },
    })
    expect(output).toContain('Beta.title')
  })
})
