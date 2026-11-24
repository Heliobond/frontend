import { expect, it } from '@/test/bun'
import { parseUsdcAmount } from '../e2e/chain/amount'

it.each([undefined, '', 'Claimable yield', '$—', '$', 'USDC 0.00', '$0.0.0', '$1,00.00'])(
  'rejects unreadable claimable yield %j',
  (text) => expect(parseUsdcAmount(text)).toBeNull(),
)

it('distinguishes displayed zero and grouped USDC amounts', () => {
  expect(parseUsdcAmount('$0.00')).toBe(0)
  expect(parseUsdcAmount('0')).toBe(0)
  expect(parseUsdcAmount('$1,234.50')).toBe(1234.5)
})
