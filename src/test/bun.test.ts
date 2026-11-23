import { expect, it, vi } from './bun'

it('restores a stubbed inherited accessor', () => {
  const base = {
    get value() {
      return 'original'
    },
  }
  const target: typeof base = Object.create(base)
  const spy = vi.spyOn(target, 'value', 'get').mockReturnValue('stubbed')

  expect(target.value).toBe('stubbed')
  spy.mockRestore()
  expect(target.value).toBe('original')
  expect(Object.hasOwn(target, 'value')).toBe(false)
})

it('advances a timeout scheduled by a Promise callback', async () => {
  vi.useFakeTimers()
  const callback = vi.fn()
  void Promise.resolve().then(() => setTimeout(callback, 25))

  await vi.advanceTimersByTimeAsync(24)
  expect(callback).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(callback).toHaveBeenCalledTimes(1)
})
