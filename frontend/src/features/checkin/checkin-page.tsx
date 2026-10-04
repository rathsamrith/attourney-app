import { CheckIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { describeError } from '@/api/client'
import { useAffirmOath, useCheckin } from '@/api/queries'
import { useCurrentSession } from '@/app/context'
import { PageHeader } from '@/app/layout'
import { BlockedState } from '@/components/attest/blocked-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { CheckinDesk } from './checkin-desk'
import { DeviceCheck } from './device-check'
import { IdentityStep } from './identity-step'

const STEPS = ['device', 'identity', 'oath', 'admission'] as const
type Step = (typeof STEPS)[number]

function Stepper({ current }: { current: Step }) {
  const { t } = useTranslation()
  const index = STEPS.indexOf(current)
  return (
    <ol className="mb-6 flex flex-wrap gap-x-6 gap-y-2" aria-label={t('checkin.title')}>
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === index ? 'step' : undefined} className="flex items-center gap-2 text-sm">
          <span
            className={cn(
              'grid size-6 place-items-center rounded-full border text-xs tabular-nums',
              i < index && 'border-status-ok bg-status-ok text-background',
              i === index && 'border-primary font-semibold text-primary',
              i > index && 'text-muted-foreground',
            )}
          >
            {i < index ? <CheckIcon className="size-3.5" aria-hidden /> : i + 1}
          </span>
          <span className={i === index ? 'font-medium' : 'text-muted-foreground'}>{t(`checkin.steps.${s}`)}</span>
        </li>
      ))}
    </ol>
  )
}

/** Spec 1.2: device check, identity, oath, then admission by the record officer. */
export function CheckinPage() {
  const { t } = useTranslation()
  const { current } = useCurrentSession()
  const status = useCheckin(current?.id)
  const oath = useAffirmOath(current?.id ?? '')
  const [devicePassed, setDevicePassed] = useState(false)

  if (!current) return <BlockedState title={t('hearing.noSessionTitle')} reason={t('hearing.noSessionReason')} />
  if (status.isPending) return <Skeleton className="h-64 w-full" />
  if (status.isError) return <BlockedState reason={describeError(status.error)} />
  const s = status.data

  const step: Step =
    s.admitted || s.oathAffirmed ? 'admission' : s.verification === 'verified' ? 'oath' : devicePassed ? 'identity' : 'device'

  return (
    <>
      <PageHeader title={t('checkin.title')} description={t('checkin.description')} />
      <div className="max-w-2xl">
        <Stepper current={step} />
        {step === 'device' && <DeviceCheck onPassed={() => setDevicePassed(true)} />}
        {step === 'identity' && <IdentityStep sessionId={current.id} status={s} />}
        {step === 'oath' && (
          <Card>
            <CardHeader>
              <CardTitle>{t('checkin.oath.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <blockquote className="border-l-2 border-primary pl-4 text-lg text-balance">
                {t(`checkin.oath.${s.oathTextVersion}`, { defaultValue: t('checkin.oath.participant-v1') })}
              </blockquote>
              {oath.isError && <BlockedState reason={describeError(oath.error)} />}
            </CardContent>
            <CardFooter>
              <Button disabled={oath.isPending} onClick={() => oath.mutate(undefined)}>
                {t('checkin.oath.affirm')}
              </Button>
            </CardFooter>
          </Card>
        )}
        {step === 'admission' &&
          (s.admitted ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('checkin.admitted.title')}</CardTitle>
                <CardDescription>{t('checkin.admitted.body')}</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button asChild>
                  <Link to="/hearing">{t('checkin.admitted.open')}</Link>
                </Button>
              </CardFooter>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{t('checkin.waiting.title')}</CardTitle>
                <CardDescription>{t('checkin.waiting.body')}</CardDescription>
              </CardHeader>
            </Card>
          ))}
      </div>

      {current.mySessionRole === 'officer' && s.admitted && (
        <section className="mt-10">
          <h2 className="mb-4 text-lg font-semibold">{t('checkin.desk.title')}</h2>
          <CheckinDesk sessionId={current.id} />
        </section>
      )}
    </>
  )
}
