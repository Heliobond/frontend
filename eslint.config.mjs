import coreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = [
  {
    // Build and test output, already covered by .gitignore and .prettierignore.
    ignores: [
      '.design-handoff/**',
      'coverage/**',
      '.next/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  ...coreWebVitals,
  ...nextTypescript,
]

export default eslintConfig
