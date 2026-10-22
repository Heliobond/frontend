// Preinstall guard (#919): only bun installs this repo. npm, yarn and pnpm
// would read the wrong lockfile and run every dependency's install scripts,
// which bun blocks by default.
import { pathToFileURL } from 'node:url'

export function isBunUserAgent(userAgent = '') {
  return /^bun\//.test(userAgent)
}

function main(userAgent = process.env.npm_config_user_agent) {
  if (isBunUserAgent(userAgent)) return 0

  const manager = userAgent?.split(' ')[0].split('/')[0] || 'an unknown package manager'
  console.error(`This repo installs with bun. Run "bun install" instead of using ${manager}.`)
  console.error('See CONTRIBUTING.md > Install policy.')
  return 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main()
}
