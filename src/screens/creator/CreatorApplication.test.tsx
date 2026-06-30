import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/render'
import { CreatorApplication } from './CreatorApplication'

describe('CreatorApplication form validation', () => {
  it('disables submit when both fields are empty', () => {
    render(<CreatorApplication />)
    const submitButton = screen.getByRole('button', { name: /submit application/i })
    expect(submitButton).toBeDisabled()
  })

  it('disables submit when only org name is filled', () => {
    render(<CreatorApplication />)
    const orgInput = screen.getByLabelText(/organization name/i)
    fireEvent.change(orgInput, { target: { value: 'Test Org' } })
    const submitButton = screen.getByRole('button', { name: /submit application/i })
    expect(submitButton).toBeDisabled()
  })

  it('disables submit when only location is filled', () => {
    render(<CreatorApplication />)
    const locationInput = screen.getByLabelText(/location/i)
    fireEvent.change(locationInput, { target: { value: 'Test City' } })
    const submitButton = screen.getByRole('button', { name: /submit application/i })
    expect(submitButton).toBeDisabled()
  })

  it('enables submit when both fields are non-empty', () => {
    render(<CreatorApplication />)
    const orgInput = screen.getByLabelText(/organization name/i)
    const locationInput = screen.getByLabelText(/location/i)
    fireEvent.change(orgInput, { target: { value: 'Test Org' } })
    fireEvent.change(locationInput, { target: { value: 'Test City' } })
    const submitButton = screen.getByRole('button', { name: /submit application/i })
    expect(submitButton).not.toBeDisabled()
  })

  it('does not enable submit with whitespace-only values', () => {
    render(<CreatorApplication />)
    const orgInput = screen.getByLabelText(/organization name/i)
    const locationInput = screen.getByLabelText(/location/i)
    fireEvent.change(orgInput, { target: { value: '   ' } })
    fireEvent.change(locationInput, { target: { value: '   ' } })
    const submitButton = screen.getByRole('button', { name: /submit application/i })
    expect(submitButton).toBeDisabled()
  })

  it('advances stage to in review after submit', () => {
    render(<CreatorApplication stage="submitted" />)
    const orgInput = screen.getByLabelText(/organization name/i)
    const locationInput = screen.getByLabelText(/location/i)
    fireEvent.change(orgInput, { target: { value: 'Test Org' } })
    fireEvent.change(locationInput, { target: { value: 'Test City' } })
    const submitButton = screen.getByRole('button', { name: /submit application/i })
    fireEvent.click(submitButton)
    expect(screen.getByText(/in review/i)).toBeInTheDocument()
  })

  it('calls onSubmit with form values', () => {
    const handleSubmit = vi.fn()
    render(<CreatorApplication onSubmit={handleSubmit} />)
    const orgInput = screen.getByLabelText(/organization name/i)
    const locationInput = screen.getByLabelText(/location/i)
    fireEvent.change(orgInput, { target: { value: 'Test Org' } })
    fireEvent.change(locationInput, { target: { value: 'Test City' } })
    const submitButton = screen.getByRole('button', { name: /submit application/i })
    fireEvent.click(submitButton)
    expect(handleSubmit).toHaveBeenCalledWith({
      orgName: 'Test Org',
      projectType: 'Solar',
      location: 'Test City',
      links: '',
    })
  })
})