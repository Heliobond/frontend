import en from '../../messages/en.json'

type Catalog = Record<string, unknown>

function isCatalog(value: unknown): value is Catalog {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Recursively overlay `override` onto `base`; missing leaves fall back to `base`. */
export function mergeCatalogs(base: Catalog, override: Catalog): Catalog {
  const out: Catalog = { ...base }
  for (const [key, value] of Object.entries(override)) {
    const baseValue = base[key]
    out[key] = isCatalog(value) && isCatalog(baseValue) ? mergeCatalogs(baseValue, value) : value
  }
  return out
}

/** Fill any key missing from `messages` with its English value (per key, not per namespace). */
export function withEnglishFallback<T extends Catalog>(messages: T): T {
  return mergeCatalogs(en as Catalog, messages) as T
}

function lookup(catalog: Catalog, path: string): string | undefined {
  let node: unknown = catalog
  for (const part of path.split('.')) {
    if (!isCatalog(node)) return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

export function messagePath(namespace: string | undefined, key: string): string {
  return [namespace, key].filter((part) => part != null && part !== '').join('.')
}

/** English copy for a missing key, or the dotted path when English has it too. */
export function getMessageFallback({
  namespace,
  key,
}: {
  namespace?: string
  key: string
}): string {
  const path = messagePath(namespace, key)
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[i18n] missing message: ${path}`)
  }
  return lookup(en as Catalog, path) ?? path
}

export function onMessageError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[i18n] ${message}`)
  }
}
