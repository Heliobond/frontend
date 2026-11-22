import { describe, expect, it, vi } from '@/test/bun'
import PropTypes from 'prop-types'
import {
  ProjectCard,
  BondCard,
  AmountInput,
  InvestmentForm,
  StatBlock,
  LiquidityMeter,
  Badge,
} from '../index'

describe('Component PropTypes validation (#309)', () => {
  it('validates ProjectCard / BondCard propTypes', () => {
    expect(ProjectCard.propTypes).toBeDefined()
    expect(BondCard.propTypes).toBeDefined()
    expect(BondCard).toBe(ProjectCard)

    const validProps = {
      name: 'Solar Plant Alpha',
      location: 'Nevada, USA',
      credit: 85,
      green: 90,
      funded: '$1.2M',
    }

    // Check propTypes against valid props
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    PropTypes.checkPropTypes(ProjectCard.propTypes, validProps, 'prop', 'ProjectCard')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('validates AmountInput / InvestmentForm propTypes', () => {
    expect(AmountInput.propTypes).toBeDefined()
    expect(InvestmentForm.propTypes).toBeDefined()
    expect(InvestmentForm).toBe(AmountInput)

    const validProps = {
      value: '100',
      currency: 'USDC',
      chips: [25, 50, 100],
      cap: 500,
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    PropTypes.checkPropTypes(AmountInput.propTypes, validProps, 'prop', 'AmountInput')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('validates StatBlock propTypes', () => {
    expect(StatBlock.propTypes).toBeDefined()

    const validProps = {
      label: 'Portfolio Value',
      value: '12,345',
      decimals: '.67',
      delta: '+$120 (+1.2%)',
      deltaDirection: 'up' as const,
      size: 'lg' as const,
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    PropTypes.checkPropTypes(StatBlock.propTypes, validProps, 'prop', 'StatBlock')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('validates LiquidityMeter propTypes', () => {
    expect(LiquidityMeter.propTypes).toBeDefined()

    const validProps = {
      liquid: 250,
      total: 1000,
      currency: '$',
      showExplanation: true,
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    PropTypes.checkPropTypes(LiquidityMeter.propTypes, validProps, 'prop', 'LiquidityMeter')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('validates Badge propTypes', () => {
    expect(Badge.propTypes).toBeDefined()

    const validProps = {
      tone: 'growth' as const,
      children: 'Active',
    }

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    PropTypes.checkPropTypes(Badge.propTypes, validProps, 'prop', 'Badge')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('reports console error when invalid prop types are supplied', () => {
    const invalidProps = {
      liquid: 'not-a-number' as unknown as number,
      total: 1000,
    }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    PropTypes.checkPropTypes(LiquidityMeter.propTypes, invalidProps, 'prop', 'LiquidityMeter')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
