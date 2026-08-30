import coreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = [{ ignores: ['.design-handoff/**'] }, ...coreWebVitals, ...nextTypescript]

export default eslintConfig
