import { LockIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

/**
 * The product's "blocked with the reason" state (spec 1.1, story "Role-scoped navigation").
 * Use it wherever an action or screen is unavailable; never just hide or disable without a reason.
 */
export function BlockedState({ title, reason }: { title?: string; reason: string }) {
  const { t } = useTranslation()
  return (
    <Alert className="border-status-procedural/40">
      <LockIcon className="text-status-procedural" />
      <AlertTitle>{title ?? t('common.blocked')}</AlertTitle>
      <AlertDescription>{reason}</AlertDescription>
    </Alert>
  )
}
