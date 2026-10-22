// Fail-closed gate over `bun audit --json` (#917).
//
// - A tool error, an unexpected exit code or unparseable output fails the gate.
//   An audit that cannot run must never look like a clean audit.
// - High and critical advisories fail the gate unless scripts/audit-allowlist.json
//   lists them for that package with an expiry date that has not passed.
//   An expired entry fails the gate so the exception gets revisited.
// - Moderate and low advisories are printed as warnings only.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const FAILING_SEVERITIES = new Set(['high', 'critical'])
const GHSA_PATTERN = /GHSA-[\w-]+/

function advisoryId(advisory) {
  return advisory.url?.match(GHSA_PATTERN)?.[0] ?? String(advisory.id)
}

// An allowlist entry covers its expiry day in full (UTC).
function isExpired(entry, today) {
  return today.getTime() > new Date(`${entry.expires}T23:59:59Z`).getTime()
}

export function evaluateAudit({
  status,
  stdout,
  stderr = '',
  error,
  allowlist = [],
  today = new Date(),
}) {
  if (error) {
    return { ok: false, failures: [`audit could not run: ${error.message}`], warnings: [] }
  }
  if (status !== 0 && status !== 1) {
    return {
      ok: false,
      failures: [`bun audit exited with ${status}: ${stderr.trim()}`],
      warnings: [],
    }
  }

  let report
  try {
    report = JSON.parse(stdout)
  } catch {
    return { ok: false, failures: ['bun audit produced unparseable output'], warnings: [] }
  }
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    return { ok: false, failures: ['bun audit output is not an advisory map'], warnings: [] }
  }

  const packages = Object.entries(report)
  if (status === 1 && packages.length === 0) {
    return {
      ok: false,
      failures: ['bun audit reported failure without any findings'],
      warnings: [],
    }
  }

  const failures = []
  const warnings = []

  for (const entry of allowlist) {
    if (isExpired(entry, today)) {
      failures.push(`allowlist entry ${entry.id} (${entry.package}) expired on ${entry.expires}`)
    }
  }

  const matched = new Set()
  for (const [pkg, advisories] of packages) {
    for (const advisory of advisories) {
      const id = advisoryId(advisory)
      const label = `${pkg} ${advisory.severity} ${id}: ${advisory.title}`
      const exception = allowlist.find((e) => e.id === id && e.package === pkg)
      const excepted = exception && !isExpired(exception, today)

      if (exception) matched.add(exception)

      if (!FAILING_SEVERITIES.has(advisory.severity)) {
        warnings.push(label)
      } else if (excepted) {
        warnings.push(`${label} (allowlisted: ${exception.reason})`)
      } else {
        failures.push(label)
      }
    }
  }

  for (const entry of allowlist) {
    if (!matched.has(entry)) {
      warnings.push(
        `allowlist entry ${entry.id} (${entry.package}) matches no current finding; remove it`,
      )
    }
  }

  return { ok: failures.length === 0, failures, warnings }
}

// `bun audit` is missing from bun 1.2.4, the version CI installs from
// packageManager, so the gate pins its own bun for the audit call.
export const AUDIT_BUN = 'bun@1.3.14'

function main(root = process.cwd()) {
  const allowlist = JSON.parse(
    readFileSync(new URL('./audit-allowlist.json', import.meta.url), 'utf8'),
  )
  const result = spawnSync('bunx', [AUDIT_BUN, 'audit', '--json'], {
    cwd: root,
    encoding: 'utf8',
  })

  const outcome = evaluateAudit({
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
    allowlist,
  })

  for (const warning of outcome.warnings) console.warn(`audit: warning: ${warning}`)
  for (const failure of outcome.failures) console.error(`audit: FAIL: ${failure}`)
  if (!outcome.ok) return 1

  console.log('audit: no unexcepted high or critical advisories')
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main()
}
