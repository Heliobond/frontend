import { render, screen } from '@/test/render'
import { CREATOR_DASHBOARD } from '@/data/creator'
import { expect, it } from '@/test/bun'
import { CreatorDashboard } from './CreatorDashboard'

it('uses the same localized funding phrase for the caption and progress value', () => {
  render(
    <CreatorDashboard data={{ ...CREATOR_DASHBOARD, fundingReceived: 320, fundingGoal: 1000 }} />,
  )

  const caption = '32% of your $1,000 goal deployed.'
  const progress = screen.getByRole('progressbar', { name: 'Funding received from the pool' })
  const captionElement = screen.getByText(caption)
  expect(captionElement).toBeVisible()
  expect(captionElement.textContent).toBe(caption)
  expect(progress).toHaveAttribute('aria-valuetext', caption)
  expect(progress).toHaveAttribute('aria-valuenow', '32')
})
