export interface AnalyticsClient {
  track: (event: string, properties?: Record<string, unknown>) => unknown
}

declare global {
  interface Window {
    analytics?: AnalyticsClient
  }
}

export function track(event: string, properties?: Record<string, unknown>): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()

  return Promise.resolve()
    .then(() => window.analytics?.track(event, properties))
    .then(() => undefined)
    .catch(() => undefined)
}
