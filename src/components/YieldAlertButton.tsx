'use client'

import { useState, type MouseEvent } from 'react'
import { useTranslations } from 'next-intl'
import { IconButton, type IconButtonSize } from './IconButton'
import { BellIcon, BellActiveIcon } from './icons'
import { useToast } from './Toast'
import { YieldAlertModal } from './YieldAlertModal'
import { useYieldAlerts } from '../alerts/YieldAlertProvider'
import { type AlertOperator } from '../lib/yieldAlerts'
import { formatDecimal } from '../lib/format'

/**
 * Bell toggle that opens the yield alert modal for a specific bond.
 * Shows BellActiveIcon if an alert exists. Safe to drop inside a clickable
 * card — it stops propagation so the card's own click doesn't also fire.
 */
export interface YieldAlertButtonProps {
  /** Unique numerical identifier of the bond for yield alert configuration. */
  bondId: number
  /** Name of the bond displayed in the alert modal header. */
  bondName: string
  /** Current effective yield for this bond, displayed in the modal. */
  currentYield: number
  /** Size variant of the icon button ('sm', 'md', 'lg'). Defaults to 'sm'. */
  size?: IconButtonSize
}

export function YieldAlertButton({
  bondId,
  bondName,
  currentYield,
  size = 'sm',
}: YieldAlertButtonProps) {
  const t = useTranslations('YieldAlert')
  const { hasAlertForBond, getAlertsForBond, add, update, remove } = useYieldAlerts()
  const { toast } = useToast()
  const [modalOpen, setModalOpen] = useState(false)
  const hasAlert = hasAlertForBond(bondId)
  const existing = getAlertsForBond(bondId)
  const firstAlert = existing[0]

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    e.preventDefault()
    setModalOpen(true)
  }

  const handleSave = (threshold: number, operator: AlertOperator) => {
    if (firstAlert) {
      update(firstAlert.id, threshold, operator)
      toast({
        tone: 'success',
        title: t('updatedToastTitle'),
        message: t('updatedToastMessage', {
          name: bondName,
          threshold: formatDecimal(threshold, 1),
        }),
      })
    } else {
      add(bondId, bondName, threshold, operator)
      toast({
        tone: 'success',
        title: t('createdToastTitle'),
        message: t('createdToastMessage', {
          name: bondName,
          threshold: formatDecimal(threshold, 1),
        }),
      })
    }
    setModalOpen(false)
  }

  const handleDelete = () => {
    if (firstAlert) {
      remove(firstAlert.id)
      toast({
        tone: 'neutral',
        title: t('deletedToastTitle'),
        message: bondName,
      })
    }
    setModalOpen(false)
  }

  return (
    <>
      <IconButton
        variant="outline"
        size={size}
        label={hasAlert ? t('editLabel', { name: bondName }) : t('addLabel', { name: bondName })}
        aria-pressed={hasAlert}
        onClick={onClick}
        style={{
          background: 'var(--surface)',
          color: hasAlert ? 'var(--solar)' : 'var(--ink-60)',
        }}
      >
        {hasAlert ? <BellActiveIcon /> : <BellIcon />}
      </IconButton>

      <YieldAlertModal
        open={modalOpen}
        bondName={bondName}
        currentYield={currentYield}
        initialThreshold={firstAlert?.threshold ?? 5}
        initialOperator={firstAlert?.operator ?? 'above'}
        editing={Boolean(firstAlert)}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={() => setModalOpen(false)}
      />
    </>
  )
}
