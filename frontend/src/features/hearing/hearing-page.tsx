import { useTranslation } from 'react-i18next'
import { describeError } from '@/api/client'
import { useDeliberation, useSession } from '@/api/queries'
import { useCurrentSession } from '@/app/context'
import { PageHeader } from '@/app/layout'
import { BlockedState } from '@/components/attest/blocked-state'
import { RecordIndicator } from '@/components/attest/record-indicator'
import { VideoPanel } from '@/components/attest/video-panel'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { DeliberationSummary } from '@/features/deliberation/deliberation-summary'
import { Appearances } from './appearances'
import { ContinuancesPanel } from './continuances-panel'
import { ObjectionsPanel } from './objections-panel'
import { PublicationPanel } from './publication-panel'
import { RecordControls } from './record-controls'
import { TranscriptPanel } from './transcript-panel'

export function HearingPage() {
  const { t } = useTranslation()
  const { current, isLoading } = useCurrentSession()
  const session = useSession(current?.id)
  const deliberation = useDeliberation(current?.id)

  if (!isLoading && !current) {
    return (
      <>
        <PageHeader title={t('hearing.title')} />
        <BlockedState title={t('hearing.noSessionTitle')} reason={t('hearing.noSessionReason')} />
      </>
    )
  }
  if (isLoading || session.isPending) return <Skeleton className="h-64 w-full" />
  if (session.isError) {
    return <BlockedState title={t('hearing.unavailableTitle')} reason={describeError(session.error)} />
  }

  const s = session.data
  const me = s.participants.find((p) => p.id === s.myParticipantId)
  const inRoom = !!me?.sworn && (me.presence === 'present' || me.presence === 'sidebar')

  return (
    <>
      <PageHeader title={t('hearing.title')} description={t('hearing.description', { caption: s.caption, day: s.dayNo })} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 gap-6">
          <PublicationPanel session={s} />
          {inRoom && s.recordState !== 'closed' && <VideoPanel sessionId={s.id} room="hearing" />}
          <TranscriptPanel session={s} />
          <Appearances session={s} />
        </div>
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('hearing.record')}</CardTitle>
              <CardDescription>
                <RecordIndicator state={s.recordState} />
              </CardDescription>
            </CardHeader>
            <CardContent>
              {s.mySessionRole === 'officer' ? (
                <RecordControls sessionId={s.id} state={s.recordState} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('hearing.notOfficer', { role: t(`sessionRoles.${s.mySessionRole}`) })}
                </p>
              )}
            </CardContent>
          </Card>
          <ObjectionsPanel session={s} />
          <ContinuancesPanel session={s} />
          {deliberation.data && <DeliberationSummary state={deliberation.data} />}
        </div>
      </div>
    </>
  )
}
