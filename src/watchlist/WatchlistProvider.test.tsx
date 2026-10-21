import { useState, useEffect, memo, createContext, type ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { WatchlistProvider, useWatchlist } from './WatchlistProvider'
import { WATCHLIST_STORAGE_KEY } from '../lib/watchlist'

function WatchlistProbe() {
  const { ids, count, has, toggle, remove, clear } = useWatchlist()
  return (
    <>
      <output aria-label="ids">{ids.join(',')}</output>
      <output aria-label="count">{count}</output>
      <output aria-label="has-3">{String(has(3))}</output>
      <button type="button" onClick={() => toggle(3)}>
        Toggle 3
      </button>
      <button type="button" onClick={() => remove(3)}>
        Remove 3
      </button>
      <button type="button" onClick={clear}>
        Clear
      </button>
    </>
  )
}

function renderProbe() {
  return render(
    <WatchlistProvider>
      <WatchlistProbe />
    </WatchlistProvider>,
  )
}

describe('WatchlistProvider', () => {
  beforeEach(() => localStorage.clear())

  it('hydrates from localStorage on mount', async () => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([1, 3]))
    renderProbe()

    expect(await screen.findByText('1,3')).toBeInTheDocument()
    expect(screen.getByLabelText('has-3')).toHaveTextContent('true')
    expect(screen.getByLabelText('count')).toHaveTextContent('2')
  })

  it('toggles a bond on and off and writes through to storage', async () => {
    const user = userEvent.setup()
    renderProbe()

    await user.click(screen.getByRole('button', { name: 'Toggle 3' }))
    expect(screen.getByLabelText('ids')).toHaveTextContent('3')
    expect(JSON.parse(localStorage.getItem(WATCHLIST_STORAGE_KEY) ?? '[]')).toEqual([3])

    await user.click(screen.getByRole('button', { name: 'Toggle 3' }))
    expect(screen.getByLabelText('ids')).toHaveTextContent('')
    expect(JSON.parse(localStorage.getItem(WATCHLIST_STORAGE_KEY) ?? '[]')).toEqual([])
  })

  it('clears the whole list', async () => {
    const user = userEvent.setup()
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([1, 2, 3]))
    renderProbe()

    await screen.findByText('1,2,3')
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByLabelText('count')).toHaveTextContent('0')
  })

  it('synchronizes changes from another tab', async () => {
    renderProbe()

    act(() => {
      localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([7]))
      window.dispatchEvent(
        new StorageEvent('storage', { key: WATCHLIST_STORAGE_KEY, newValue: '[7]' }),
      )
    })

    expect(await screen.findByText('7')).toBeInTheDocument()
  })

  it('throws when useWatchlist is used outside the provider', () => {
    const Bare = () => {
      useWatchlist()
      return null
    }
    expect(() => render(<Bare />)).toThrow(/within <WatchlistProvider>/)
  })

  it('preserves value reference and prevents extra consumer renders when parent re-renders with unchanged state', () => {
    let consumerRenderCount = 0
    let latestValue: ReturnType<typeof useWatchlist> | undefined

    const Consumer = memo(function Consumer() {
      const value = useWatchlist()
      // Recorded after commit, not during render.
      useEffect(() => {
        consumerRenderCount++
        latestValue = value
      })
      return <div>Consumer rendered</div>
    })

    let triggerParentRender!: () => void
    function Parent() {
      const [, setTick] = useState(0)
      useEffect(() => {
        triggerParentRender = () => setTick((t) => t + 1)
      }, [])
      return (
        <WatchlistProvider>
          <Consumer />
        </WatchlistProvider>
      )
    }

    render(<Parent />)
    expect(consumerRenderCount).toBe(1)
    const initialValue = latestValue

    act(() => {
      triggerParentRender()
    })

    expect(consumerRenderCount).toBe(1)
    expect(latestValue).toBe(initialValue)
  })

  it('keeps callback identities stable across state updates via ref', async () => {
    const user = userEvent.setup()
    let prevCallbacks: {
      has: (id: number) => boolean
      add: (id: number) => void
      remove: (id: number) => void
      toggle: (id: number) => boolean
      clear: () => void
    } | null = null

    function CallbackTracker() {
      const { has, add, remove, toggle, clear } = useWatchlist()
      useEffect(() => {
        if (!prevCallbacks) {
          prevCallbacks = { has, add, remove, toggle, clear }
        } else {
          expect(has).toBe(prevCallbacks.has)
          expect(add).toBe(prevCallbacks.add)
          expect(remove).toBe(prevCallbacks.remove)
          expect(toggle).toBe(prevCallbacks.toggle)
          expect(clear).toBe(prevCallbacks.clear)
        }
      })
      return (
        <button type="button" onClick={() => toggle(42)}>
          Toggle 42
        </button>
      )
    }

    render(
      <WatchlistProvider>
        <CallbackTracker />
      </WatchlistProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Toggle 42' }))
    expect(prevCallbacks).not.toBeNull()
  })

  it('shows no extra render when an unrelated provider updates', () => {
    let consumerRenderCount = 0
    let triggerUnrelatedUpdate!: () => void

    const UnrelatedContext = createContext<{ count: number; bump: () => void }>({
      count: 0,
      bump: () => {},
    })

    function UnrelatedProvider({ children }: { children: ReactNode }) {
      const [count, setCount] = useState(0)
      useEffect(() => {
        triggerUnrelatedUpdate = () => setCount((c) => c + 1)
      }, [])
      return (
        <UnrelatedContext.Provider value={{ count, bump: () => setCount((c) => c + 1) }}>
          {children}
        </UnrelatedContext.Provider>
      )
    }

    const Consumer = memo(function Consumer() {
      useWatchlist()
      useEffect(() => {
        consumerRenderCount++
      })
      return <div>Consumer rendered</div>
    })

    render(
      <UnrelatedProvider>
        <WatchlistProvider>
          <Consumer />
        </WatchlistProvider>
      </UnrelatedProvider>,
    )

    expect(consumerRenderCount).toBe(1)

    act(() => {
      triggerUnrelatedUpdate()
    })

    // Consumer does not re-render because WatchlistProvider context value is memoized
    expect(consumerRenderCount).toBe(1)
  })
})
