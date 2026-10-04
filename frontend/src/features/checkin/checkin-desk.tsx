import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { describeError } from '@/api/client'
import type { QueueEntryDto } from '@/api/generated'
import { useAdmit, useCheckinQueue, useManualVerify } from '@/api/queries'
import { BlockedState } from '@/components/attest/blocked-state'
import { StatusBadge } from '@/components/attest/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

function Who({ entry }: { entry: QueueEntryDto }) {
  const { t } = useTranslation()
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">{entry.name}</p>
      <p className="text-xs text-muted-foreground">
        {t(`sessionRoles.${entry.sessionRole}`)} · {t(`sides.${entry.side}`)}
      </p>
    </div>
  )
}

function ManualRow({ sessionId, entry }: { sessionId: string; entry: QueueEntryDto }) {
  const { t } = useTranslation()
  const verify = useManualVerify(sessionId)
  const [doc, setDoc] = useState('')
  const inputId = `doc-${entry.participantId}`
  return (
    <li className="grid gap-2 py-3">
      <div className="flex items-start justify-between gap-3">
        <Who entry={entry} />
        <span className="text-xs text-muted-foreground tabular-nums">
          {t('checkin.desk.failedAttempts', { count: entry.attemptsUsed })}
        </span>
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          verify.mutate({ participantId: entry.participantId, documentChecked: doc.trim() })
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          {t('checkin.desk.document')}
        </label>
        <Input
          id={inputId}
          className="min-w-48 flex-1"
          placeholder={t('checkin.desk.documentPlaceholder')}
          value={doc}
          onChange={(e) => setDoc(e.target.value)}
        />
        <Button type="submit" disabled={doc.trim().length < 3 || verify.isPending}>
          {t('checkin.desk.markVerified')}
        </Button>
      </form>
      {verify.isError && <BlockedState reason={describeError(verify.error)} />}
    </li>
  )
}

function AdmitRow({ sessionId, entry }: { sessionId: string; entry: QueueEntryDto }) {
  const { t } = useTranslation()
  const admit = useAdmit(sessionId)
  return (
    <li className="grid gap-2 py-3">
      <div className="flex items-center justify-between gap-3">
        <Who entry={entry} />
        <Button size="sm" disabled={admit.isPending} onClick={() => admit.mutate(entry.participantId)}>
          {t('checkin.desk.admit')}
        </Button>
      </div>
      {admit.isError && <BlockedState reason={describeError(admit.error)} />}
    </li>
  )
}

/** The record officer's side of check-in: manual verification and admission. */
export function CheckinDesk({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation()
  const queue = useCheckinQueue(sessionId)
  if (queue.isPending) return <Skeleton className="h-40 w-full" />
  if (queue.isError) return <BlockedState reason={describeError(queue.error)} />
  const q = queue.data

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>{t('checkin.desk.manualTitle')}</CardTitle>
          <CardDescription>{t('checkin.desk.manualHelp')}</CardDescription>
        </CardHeader>
        <CardContent>
          {q.manualVerification.length ? (
            <ul className="divide-y">
              {q.manualVerification.map((e) => (
                <ManualRow key={e.participantId} sessionId={sessionId} entry={e} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('checkin.desk.empty')}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('checkin.desk.admissionTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {q.awaitingAdmission.length ? (
            <ul className="divide-y">
              {q.awaitingAdmission.map((e) => (
                <AdmitRow key={e.participantId} sessionId={sessionId} entry={e} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('checkin.desk.empty')}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('checkin.desk.inProgressTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {q.inProgress.length ? (
            <ul className="divide-y">
              {q.inProgress.map((e) => (
                <li key={e.participantId} className="flex items-center justify-between gap-3 py-3">
                  <Who entry={e} />
                  {e.verification === 'verified' ? (
                    <span className="text-xs text-muted-foreground">{t('checkin.desk.noOath')}</span>
                  ) : (
                    <StatusBadge value={e.verification} />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('checkin.desk.empty')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
