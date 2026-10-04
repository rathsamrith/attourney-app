import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { describeError } from '@/api/client'
import type { RaiseObjectionDto, SessionDetailDto } from '@/api/generated'
import { useObjections, useRaiseObjection, useRuleObjection, useTranscript } from '@/api/queries'
import { BlockedState } from '@/components/attest/blocked-state'
import { Field, NativeSelect } from '@/components/attest/form'
import { StatusBadge } from '@/components/attest/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const GROUNDS: RaiseObjectionDto['grounds'][] = [
  'relevance',
  'hearsay',
  'leading',
  'speculation',
  'compound',
  'asked_and_answered',
  'argumentative',
  'foundation',
  'privilege',
  'form',
]

/** Stories "Log objection" and "Rule on objection". */
export function ObjectionsPanel({ session }: { session: SessionDetailDto }) {
  const { t } = useTranslation()
  const objections = useObjections(session.id)
  const lines = useTranscript(session.id)
  const raise = useRaiseObjection(session.id)
  const rule = useRuleObjection(session.id)
  const [grounds, setGrounds] = useState<RaiseObjectionDto['grounds']>('relevance')
  const [lineId, setLineId] = useState('')

  const isCounsel = session.mySessionRole === 'counsel'
  const isPresiding = session.mySessionRole === 'presiding'
  // Default to the latest question so objecting is one click in the moment.
  const recentLines = (lines.data ?? []).slice(-10).reverse()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('proceeding.objections.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isCounsel && session.recordState !== 'closed' && (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              raise.mutate({ grounds, ...(lineId && { transcriptLineId: lineId }) })
            }}
          >
            <Field label={t('proceeding.objections.grounds')} htmlFor="objection-grounds">
              <NativeSelect id="objection-grounds" value={grounds} onChange={(e) => setGrounds(e.target.value as typeof grounds)}>
                {GROUNDS.map((g) => (
                  <option key={g} value={g}>
                    {t(`proceeding.objections.groundsList.${g}`)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={t('proceeding.objections.line')} htmlFor="objection-line">
              <NativeSelect id="objection-line" value={lineId} onChange={(e) => setLineId(e.target.value)}>
                <option value="">{t('proceeding.objections.noLine')}</option>
                {recentLines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.seq}. {l.text.slice(0, 60)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {raise.isError && <BlockedState reason={describeError(raise.error)} />}
            <div>
              <Button type="submit" variant="destructive" disabled={raise.isPending}>
                {t('proceeding.objections.raise')}
              </Button>
            </div>
          </form>
        )}

        {rule.isError && <BlockedState reason={describeError(rule.error)} />}
        {objections.data?.length ? (
          <ul className="divide-y">
            {objections.data.map((o) => (
              <li key={o.id} className="grid gap-2 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{t(`proceeding.objections.groundsList.${o.grounds}`, { defaultValue: o.grounds })}</span>
                  <StatusBadge value={o.ruling} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {o.raisedByName} · {t(`sides.${o.raisedBySide}`)}
                  {o.lineSeq !== null && <> · {t('proceeding.objections.onLine', { seq: o.lineSeq })}</>}
                </p>
                {isPresiding && o.ruling === 'pending' && (
                  <div className="flex gap-2">
                    <Button size="sm" disabled={rule.isPending} onClick={() => rule.mutate({ id: o.id, ruling: 'sustained' })}>
                      {t('proceeding.objections.sustain')}
                    </Button>
                    <Button size="sm" variant="outline" disabled={rule.isPending} onClick={() => rule.mutate({ id: o.id, ruling: 'overruled' })}>
                      {t('proceeding.objections.overrule')}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('proceeding.objections.empty')}</p>
        )}
      </CardContent>
    </Card>
  )
}
