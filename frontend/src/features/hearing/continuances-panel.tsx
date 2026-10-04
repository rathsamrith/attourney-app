import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { describeError } from '@/api/client'
import type { SessionDetailDto } from '@/api/generated'
import { useContinuances, useRequestContinuance, useRuleContinuance } from '@/api/queries'
import { BlockedState } from '@/components/attest/blocked-state'
import { Field, Textarea } from '@/components/attest/form'
import { StatusBadge } from '@/components/attest/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useFormat } from '@/i18n/format'

/** Stories "Request continuance" and "Rule on continuance" (R3, R2). */
export function ContinuancesPanel({ session }: { session: SessionDetailDto }) {
  const { t } = useTranslation()
  const fmt = useFormat()
  const list = useContinuances(session.id)
  const request = useRequestContinuance(session.id)
  const rule = useRuleContinuance(session.id)
  const [reason, setReason] = useState('')
  const [resumeAt, setResumeAt] = useState('')

  const isCounsel = session.mySessionRole === 'counsel'
  const isPresiding = session.mySessionRole === 'presiding'
  const pending = list.data?.find((c) => c.status === 'requested')

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('proceeding.continuances.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* R3: with no request, the ruling panel shows as blocked with the reason. */}
        {isPresiding && !pending && <BlockedState reason={t('proceeding.continuances.noRequest')} />}
        {rule.isError && <BlockedState reason={describeError(rule.error)} />}

        {list.data?.length ? (
          <ul className="divide-y">
            {list.data.map((c) => (
              <li key={c.id} className="grid gap-2 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t('proceeding.continuances.byLine', { name: c.requestedByName, side: t(`sides.${c.requestedBySide}`) })}
                  </span>
                  <StatusBadge value={c.status} />
                </div>
                <p>{c.reason}</p>
                {c.proposedResumeAt && (
                  <p className="text-xs text-muted-foreground">
                    {t('proceeding.continuances.resumeAt')}: {fmt.date(c.proposedResumeAt)}
                  </p>
                )}
                {isPresiding && c.status === 'requested' && (
                  <div className="flex gap-2">
                    <Button size="sm" disabled={rule.isPending} onClick={() => rule.mutate({ id: c.id, status: 'granted' })}>
                      {t('proceeding.continuances.grant')}
                    </Button>
                    <Button size="sm" variant="outline" disabled={rule.isPending} onClick={() => rule.mutate({ id: c.id, status: 'denied' })}>
                      {t('proceeding.continuances.deny')}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          !isPresiding && <p className="text-sm text-muted-foreground">{t('proceeding.continuances.empty')}</p>
        )}

        {isCounsel && !pending && session.recordState !== 'closed' && (
          <form
            className="grid gap-3 border-t pt-4"
            onSubmit={(e) => {
              e.preventDefault()
              request.mutate(
                { reason: reason.trim(), ...(resumeAt && { proposedResumeAt: new Date(resumeAt).toISOString() }) },
                { onSuccess: () => setReason('') },
              )
            }}
          >
            <p className="text-sm font-medium">{t('proceeding.continuances.request')}</p>
            <Field label={t('proceeding.continuances.reason')} htmlFor="continuance-reason">
              <Textarea id="continuance-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Field label={t('proceeding.continuances.resumeAt')} htmlFor="continuance-resume">
              <Input id="continuance-resume" type="date" value={resumeAt} onChange={(e) => setResumeAt(e.target.value)} />
            </Field>
            {request.isError && <BlockedState reason={describeError(request.error)} />}
            <div>
              <Button type="submit" disabled={reason.trim().length < 3 || request.isPending}>
                {t('proceeding.continuances.submit')}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
