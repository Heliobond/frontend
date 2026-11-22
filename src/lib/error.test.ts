import { describe, expect, it } from '@/test/bun'

import { ApiError, isApiError, normalizeApiError } from './error'

describe('shared API error handling', () => {
  it('normalizes a server payload into a consistent ApiError instance', () => {
    const error = normalizeApiError({
      code: 'validation_error',
      message: 'Bad request',
      status: 400,
      details: { field: 'amount' },
    })

    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe('validation_error')
    expect(error.message).toBe('Bad request')
    expect(error.status).toBe(400)
    expect(isApiError(error)).toBe(true)
  })

  it('reads nested error payloads without losing the original message', () => {
    const error = normalizeApiError({
      error: {
        code: 'network_error',
        message: 'Request timed out',
      },
    })

    expect(error.code).toBe('network_error')
    expect(error.message).toBe('Request timed out')
    expect(error.retryable).toBe(true)
  })
})
