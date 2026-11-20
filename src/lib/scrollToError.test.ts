// Unit tests for scrollToError module

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { scrollToFirstError, scrollToField } from './scrollToError'

describe('scrollToError', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    // Create a fresh container for each test
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('scrollToFirstError', () => {
    it('should return false when no error elements are found', () => {
      container.innerHTML = '<div>No errors here</div>'
      const result = scrollToFirstError(container)
      expect(result).toBe(false)
    })

    it('should find and scroll to element with aria-invalid="true"', () => {
      const input = document.createElement('input')
      input.setAttribute('aria-invalid', 'true')
      input.scrollIntoView = vi.fn()
      container.appendChild(input)

      const result = scrollToFirstError(container)
      expect(result).toBe(true)
      expect(input.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    })

    it('should find and scroll to element with data-invalid="true"', () => {
      const div = document.createElement('div')
      div.setAttribute('data-invalid', 'true')
      div.scrollIntoView = vi.fn()
      container.appendChild(div)

      const result = scrollToFirstError(container)
      expect(result).toBe(true)
      expect(div.scrollIntoView).toHaveBeenCalled()
    })

    it('should find and scroll to element with class "field-error"', () => {
      const span = document.createElement('span')
      span.className = 'field-error'
      span.scrollIntoView = vi.fn()
      container.appendChild(span)

      const result = scrollToFirstError(container)
      expect(result).toBe(true)
      expect(span.scrollIntoView).toHaveBeenCalled()
    })

    it('should find and scroll to element with role="alert"', () => {
      const alert = document.createElement('div')
      alert.setAttribute('role', 'alert')
      alert.scrollIntoView = vi.fn()
      container.appendChild(alert)

      const result = scrollToFirstError(container)
      expect(result).toBe(true)
      expect(alert.scrollIntoView).toHaveBeenCalled()
    })

    it('should prefer scrolling to [data-field-wrapper] ancestor if present', () => {
      const wrapper = document.createElement('div')
      wrapper.setAttribute('data-field-wrapper', '')
      wrapper.scrollIntoView = vi.fn()

      const input = document.createElement('input')
      input.setAttribute('aria-invalid', 'true')
      input.scrollIntoView = vi.fn()

      wrapper.appendChild(input)
      container.appendChild(wrapper)

      scrollToFirstError(container)
      // Should scroll the wrapper, not the input
      expect(wrapper.scrollIntoView).toHaveBeenCalled()
      expect(input.scrollIntoView).not.toHaveBeenCalled()
    })

    it('should focus the first focusable child immediately', () => {
      const input = document.createElement('input')
      input.setAttribute('aria-invalid', 'true')
      input.scrollIntoView = vi.fn()
      input.focus = vi.fn()
      container.appendChild(input)

      scrollToFirstError(container, { focus: true })

      expect(input.focus).toHaveBeenCalledWith({ preventScroll: true })
    })

    it('should not focus when focus option is false', () => {
      const input = document.createElement('input')
      input.setAttribute('aria-invalid', 'true')
      input.scrollIntoView = vi.fn()
      input.focus = vi.fn()
      container.appendChild(input)

      scrollToFirstError(container, { focus: false })

      expect(input.focus).not.toHaveBeenCalled()
    })

    it('should focus the wrapper element itself if no focusable child exists', () => {
      const div = document.createElement('div')
      div.setAttribute('aria-invalid', 'true')
      div.scrollIntoView = vi.fn()
      // Make div focusable but not a standard input
      div.tabIndex = -1
      div.focus = vi.fn()
      container.appendChild(div)

      scrollToFirstError(container, { focus: true })

      expect(div.focus).toHaveBeenCalledWith({ preventScroll: true })
    })

    it('should handle non-focusable elements gracefully', () => {
      const div = document.createElement('div')
      div.setAttribute('aria-invalid', 'true')
      div.scrollIntoView = vi.fn()
      // Div has no focus method by default in jsdom, so mock it to be undefined
      container.appendChild(div)

      // Should not throw
      expect(() => {
        scrollToFirstError(container, { focus: true })
      }).not.toThrow()
    })

    it('should use custom behavior and block options', () => {
      const input = document.createElement('input')
      input.setAttribute('aria-invalid', 'true')
      input.scrollIntoView = vi.fn()
      container.appendChild(input)

      scrollToFirstError(container, { behavior: 'auto', block: 'start' })
      expect(input.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
    })

    it('should work with document as container', () => {
      const input = document.createElement('input')
      input.setAttribute('aria-invalid', 'true')
      input.scrollIntoView = vi.fn()
      document.body.appendChild(input)

      const result = scrollToFirstError(document)
      expect(result).toBe(true)
      expect(input.scrollIntoView).toHaveBeenCalled()
    })

    it('should find the first error when multiple errors exist', () => {
      const input1 = document.createElement('input')
      input1.setAttribute('aria-invalid', 'true')
      input1.id = 'first'
      input1.scrollIntoView = vi.fn()

      const input2 = document.createElement('input')
      input2.setAttribute('aria-invalid', 'true')
      input2.id = 'second'
      input2.scrollIntoView = vi.fn()

      container.appendChild(input1)
      container.appendChild(input2)

      scrollToFirstError(container)
      // Only the first one should be scrolled to
      expect(input1.scrollIntoView).toHaveBeenCalled()
      expect(input2.scrollIntoView).not.toHaveBeenCalled()
    })

    it('should focus input inside field-wrapper immediately', () => {
      const wrapper = document.createElement('div')
      wrapper.setAttribute('data-field-wrapper', '')
      wrapper.setAttribute('aria-invalid', 'true')
      wrapper.scrollIntoView = vi.fn()

      const input = document.createElement('input')
      input.focus = vi.fn()
      wrapper.appendChild(input)
      container.appendChild(wrapper)

      scrollToFirstError(container, { focus: true })

      expect(input.focus).toHaveBeenCalledWith({ preventScroll: true })
    })
  })

  describe('scrollToField', () => {
    it('should return false when field with given id does not exist', () => {
      const result = scrollToField('non-existent')
      expect(result).toBe(false)
    })

    it('should scroll to field with given id', () => {
      const input = document.createElement('input')
      input.id = 'email-field'
      input.scrollIntoView = vi.fn()
      container.appendChild(input)

      const result = scrollToField('email-field')
      expect(result).toBe(true)
      expect(input.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    })

    it('should focus the field immediately', () => {
      const input = document.createElement('input')
      input.id = 'email-field'
      input.scrollIntoView = vi.fn()
      input.focus = vi.fn()
      container.appendChild(input)

      scrollToField('email-field', { focus: true })

      expect(input.focus).toHaveBeenCalledWith({ preventScroll: true })
    })

    it('should not focus when focus option is false', () => {
      const input = document.createElement('input')
      input.id = 'email-field'
      input.scrollIntoView = vi.fn()
      input.focus = vi.fn()
      container.appendChild(input)

      scrollToField('email-field', { focus: false })

      expect(input.focus).not.toHaveBeenCalled()
    })

    it('should use custom behavior and block options', () => {
      const input = document.createElement('input')
      input.id = 'email-field'
      input.scrollIntoView = vi.fn()
      container.appendChild(input)

      scrollToField('email-field', { behavior: 'auto', block: 'nearest' })
      expect(input.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'nearest' })
    })

    it('should handle non-focusable elements gracefully', () => {
      const div = document.createElement('div')
      div.id = 'non-focusable'
      div.scrollIntoView = vi.fn()
      container.appendChild(div)

      // Should not throw even if focus is not a function
      expect(() => {
        scrollToField('non-focusable', { focus: true })
      }).not.toThrow()
    })

    it('should work with elements other than inputs', () => {
      const textarea = document.createElement('textarea')
      textarea.id = 'comment'
      textarea.scrollIntoView = vi.fn()
      textarea.focus = vi.fn()
      container.appendChild(textarea)

      scrollToField('comment', { focus: true })

      expect(textarea.scrollIntoView).toHaveBeenCalled()
      expect(textarea.focus).toHaveBeenCalled()
    })
  })
})
