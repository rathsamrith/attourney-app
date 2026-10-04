import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { describeError } from '@/api/client'
import type { CastBallotDto } from '@/api/generated'
import { useCastBallot, useDeliberation, useSealBallot } from '@/api/queries'
import { useCurrentSession } from '@/app/context'
import { PageHeader } from '@/app/layout'
import { BlockedState } from '@/components/attest/blocked-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { DeliberationSummary } from './deliberation-summary'

const CHOICES: CastBallotDto['choice'][] = ['for_plaintiff', 'for_defense']

/** Stories "Cast and seal" and "Simultaneous reveal" (R6). */
export function DeliberationPage() {
  const { t } = useTranslation()
  const { current } = useCurrentSession()
  const state = useDeliberation(current?.id)
  const cast = useCastBallot(current?.id ?? '')
  const seal = useSealBallot(current?.id ?? '')
  const [confirmSeal, setConfirmSeal] = useState(false)

  if (!current) return <BlockedState title={t('hearing.noSessionTitle')} reason={t('hearing.noSessionReason')} />
  if (state.isPending) return <Skeleton className="h-64 w-full" />
  if (state.isError) return <BlockedState reason={describeError(state.error)} />
  const d = state.data
  const error = cast.error ?? seal.error

  return (
    <>
      <PageHeader title={t('deliberation.title')} description={t('deliberation.description')} />
      <div className="grid max-w-3xl gap-6">
        {d.panelSize === 0 && <BlockedState reason={t('deliberation.noPanel')} />}
        {d.iAmPanelist && !d.revealed && (
          <Card>
            <CardHeader>
              <CardTitle>{t('deliberation.yourBallot')}</CardTitle>
              {d.myStatus === 'draft' && d.myDraftChoice && (
                <CardDescription>{t('deliberation.draft', { choice: t(`deliberation.choices.${d.myDraftChoice}`) })}</CardDescription>
              )}
            </CardHeader>
            {d.myStatus === 'sealed' ? (
              <CardContent>
                <p className="font-medium text-status-ok">{t('deliberation.sealed')}</p>
              </CardContent>
            ) : (
              <>
                <CardContent className="grid gap-2 sm:grid-cols-2">
                  {CHOICES.map((c) => (
                    <Button
                      key={c}
                      variant="outline"
                      aria-pressed={d.myDraftChoice === c}
                      className={cn('h-auto min-h-12 whitespace-normal', d.myDraftChoice === c && 'border-primary ring-2 ring-primary/30')}
                      disabled={cast.isPending}
                      onClick={() => cast.mutate(c)}
                    >
                      {t(`deliberation.choices.${c}`)}
                    </Button>
                  ))}
                </CardContent>
                <CardFooter className="block space-y-3">
                  {error && <BlockedState reason={describeError(error)} />}
                  {confirmSeal ? (
                    <Alert>
                      <AlertDescription className="space-y-2">
                        <p>{t('deliberation.sealConfirm')}</p>
                        <div className="flex gap-2">
                          <Button size="sm" disabled={seal.isPending} onClick={() => seal.mutate(undefined, { onSettled: () => setConfirmSeal(false) })}>
                            {t('deliberation.sealConfirmButton')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmSeal(false)}>
                            {t('deliberation.cancel')}
                          </Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Button disabled={d.myStatus !== 'draft'} onClick={() => setConfirmSeal(true)}>
                      {t('deliberation.seal')}
                    </Button>
                  )}
                </CardFooter>
              </>
            )}
          </Card>
        )}
        <DeliberationSummary state={d} />
      </div>
    </>
  )
}
