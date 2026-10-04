import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { describeError } from '@/api/client'
import type { SetRecordStateDto } from '@/api/generated'
import { useSetRecordState } from '@/api/queries'
import { BlockedState } from '@/components/attest/blocked-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

type Target = SetRecordStateDto['state']

const ACTIONS: { to: Target; labelKey: 'hearing.goOnRecord' | 'hearing.goOffRecord' | 'hearing.recess' }[] = [
  { to: 'open', labelKey: 'hearing.goOnRecord' },
  { to: 'off', labelKey: 'hearing.goOffRecord' },
  { to: 'recess', labelKey: 'hearing.recess' },
]

/** Story "Record state": the record officer's controls. */
export function RecordControls({ sessionId, state }: { sessionId: string; state: string }) {
  const { t } = useTranslation()
  const setState = useSetRecordState(sessionId)
  const [confirmClose, setConfirmClose] = useState(false)
  // Keep the error itself, not a string, so the message follows language changes.
  const [blocked, setBlocked] = useState<unknown>()

  const run = (to: Target) => {
    setBlocked(undefined)
    setState.mutate(to, {
      onSuccess: () => toast.success(t('hearing.changedToast')),
      onError: (err) => setBlocked(err),
      onSettled: () => setConfirmClose(false),
    })
  }

  if (state === 'closed') {
    return <BlockedState title={t('hearing.closedTitle')} reason={t('hearing.closedReason')} />
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        {ACTIONS.map((a) => (
          <Button
            key={a.to}
            variant={a.to === 'open' ? 'default' : 'outline'}
            className="h-auto min-h-9 whitespace-normal"
            disabled={setState.isPending || state === a.to}
            onClick={() => run(a.to)}
          >
            {t(a.labelKey)}
          </Button>
        ))}
      </div>

      {confirmClose ? (
        <Alert variant="destructive">
          <AlertTitle>{t('hearing.confirmCloseTitle')}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{t('hearing.confirmCloseBody')}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" size="sm" disabled={setState.isPending} onClick={() => run('closed')}>
                {t('hearing.confirmClose')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmClose(false)}>
                {t('hearing.keepOpen')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <Button variant="ghost" className="w-full text-destructive" onClick={() => setConfirmClose(true)}>
          {t('hearing.closeSession')}
        </Button>
      )}

      {blocked !== undefined && <BlockedState reason={describeError(blocked)} />}
    </div>
  )
}
