/**
 * Contract identifiers the deployment is configured with.
 *
 * Next.js only inlines public environment variables when each one is spelled
 * out literally, so every variable is read by name here rather than through a lookup.
 * A blank or whitespace-only value counts as "not configured".
 */
export interface ConfiguredContracts {
  registry: string | null
  vault: string | null
}

function clean(raw: string | undefined): string | null {
  const v = raw?.trim()
  return v ? v : null
}

export function getConfiguredContracts(): ConfiguredContracts {
  return {
    registry: clean(process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID),
    vault: clean(process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID),
  }
}
