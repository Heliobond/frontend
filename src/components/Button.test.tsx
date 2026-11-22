import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/render'
import { Button } from './Button'

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Invest now</Button>)
    expect(screen.getByRole('button', { name: 'Invest now' })).toBeInTheDocument()
  })

  it('fires onClick when clicked', () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Click me</Button>)
    fireEvent.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledOnce()
  })

  it('does not fire onClick when disabled', () => {
    const handleClick = vi.fn()
    render(
      <Button disabled reason="Wallet not connected" onClick={handleClick}>
        Connect
      </Button>,
    )
    const btn = screen.getByRole('button')
    fireEvent.click(btn)
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('is marked disabled in the DOM when disabled prop is set', () => {
    render(<Button disabled>Submit</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('shows the reason as a tooltip title when disabled', () => {
    render(
      <Button disabled reason="Minimum deposit is $1">
        Invest
      </Button>,
    )
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Minimum deposit is $1')
  })

  it('does not set title when not disabled', () => {
    render(<Button reason="ignored">Invest</Button>)
    expect(screen.getByRole('button')).not.toHaveAttribute('title')
  })

  it('renders primary variant by default with token variables', () => {
    render(<Button>Primary</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toBeInTheDocument()
    expect(btn.style.background).toContain('var(--button-primary-bg)')
    expect(btn.style.color).toContain('var(--button-primary-fg)')
  })

  it('marks aria-busy when loading', () => {
    render(<Button loading>Saving</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
  })

  it('renders with sm size without crashing', () => {
    render(<Button size="sm">Small</Button>)
    expect(screen.getByRole('button', { name: 'Small' })).toBeInTheDocument()
  })

  it('renders with lg size without crashing', () => {
    render(<Button size="lg">Large</Button>)
    expect(screen.getByRole('button', { name: 'Large' })).toBeInTheDocument()
  })

  it('renders ghost variant without crashing', () => {
    render(<Button variant="ghost">Ghost</Button>)
    expect(screen.getByRole('button', { name: 'Ghost' })).toBeInTheDocument()
  })

  it('renders secondary variant without crashing', () => {
    render(<Button variant="secondary">Secondary</Button>)
    expect(screen.getByRole('button', { name: 'Secondary' })).toBeInTheDocument()
  })

  it('uses submit type when specified', () => {
    render(<Button type="submit">Submit form</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('defaults to button type', () => {
    render(<Button>Default type</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  describe('disabled explanation (#1073)', () => {
    it('exposes the reason as the accessible description, not only a title', () => {
      render(
        <Button disabled reason="Minimum deposit is $1">
          Invest
        </Button>,
      )
      const btn = screen.getByRole('button', { name: 'Invest' })
      expect(btn).toBeDisabled()
      expect(btn).toHaveAccessibleDescription('Minimum deposit is $1')
      expect(screen.getByText('Minimum deposit is $1')).toBeInTheDocument()
    })

    it('keeps ordinary disabled semantics when there is no reason', () => {
      const { container } = render(<Button disabled>Invest</Button>)
      expect(screen.getByRole('button')).not.toHaveAttribute('aria-describedby')
      expect(container.querySelectorAll('span[id]')).toHaveLength(0)
    })

    it('does not describe an enabled button with its reason', () => {
      render(<Button reason="Not needed">Invest</Button>)
      expect(screen.getByRole('button')).not.toHaveAttribute('aria-describedby')
      expect(screen.queryByText('Not needed')).not.toBeInTheDocument()
    })

    it('gives each control a unique explanation id', () => {
      render(
        <>
          <Button disabled reason="First reason">
            One
          </Button>
          <Button disabled reason="Second reason">
            Two
          </Button>
        </>,
      )
      const one = screen.getByRole('button', { name: 'One' })
      const two = screen.getByRole('button', { name: 'Two' })
      expect(one.getAttribute('aria-describedby')).not.toBe(two.getAttribute('aria-describedby'))
      expect(one).toHaveAccessibleDescription('First reason')
      expect(two).toHaveAccessibleDescription('Second reason')
    })

    it('preserves a caller-supplied aria-describedby alongside the reason', () => {
      render(
        <>
          <span id="hint">Extra hint</span>
          <Button disabled reason="Because" aria-describedby="hint">
            Go
          </Button>
        </>,
      )
      expect(screen.getByRole('button', { name: 'Go' })).toHaveAccessibleDescription(
        'Extra hint Because',
      )
    })

    it('still never fires onClick while disabled', () => {
      const onClick = vi.fn()
      render(
        <Button disabled reason="Nope" onClick={onClick}>
          Go
        </Button>,
      )
      fireEvent.click(screen.getByText('Nope'))
      fireEvent.click(screen.getByRole('button'))
      expect(onClick).not.toHaveBeenCalled()
    })
  })
})
