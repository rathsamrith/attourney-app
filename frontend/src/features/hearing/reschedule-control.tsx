import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { describeError } from '@/api/client'
import { useRescheduleSession } from '@/api/queries'
import { BlockedState } from '@/components/attest/blocked-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** An ISO timestamp as the value a <input type="datetime-local"> expects (local time). */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Story "Reschedule hearing": the record officer moves the session's start time.
 * Shown only while the session is off the record (the server enforces this too).
 */
export function RescheduleControl({ sessionId, startsAt }: { sessionId: string; startsAt: string }) {
  const { t } = useTranslation()
  const reschedule = useRescheduleSession(sessionId)
  const [value, setValue] = useState(() => toLocalInput(startsAt))
  const [blocked, setBlocked] = useState<unknown>()

  const save = () => {
    setBlocked(undefined)
    reschedule.mutate(new Date(value).toISOString(), {
      onSuccess: () => toast.success(t('hearing.rescheduledToast')),
      onError: (err) => setBlocked(err),
    })
  }

  return (
    <div className="space-y-2 border-t pt-3">
      <label htmlFor="reschedule-at" className="text-sm font-medium">
        {t('hearing.rescheduleTitle')}
      </label>
      <p className="text-xs text-muted-foreground">{t('hearing.rescheduleHint')}</p>
      <div className="flex flex-wrap gap-2">
        <Input
          id="reschedule-at"
          type="datetime-local"
          className="w-auto grow"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button variant="outline" disabled={reschedule.isPending || !value} onClick={save}>
          {t('hearing.reschedule')}
        </Button>
      </div>
      {blocked !== undefined && <BlockedState reason={describeError(blocked)} />}
    </div>
  )
}
