import { useTranslation } from 'react-i18next'
import { describeError } from '@/api/client'
import { useCaucus, useCloseCaucus, useJoinCaucus, useLeaveCaucus, useOpenCaucus } from '@/api/queries'
import { useCurrentSession } from '@/app/context'
import { PageHeader } from '@/app/layout'
import { BlockedState } from '@/components/attest/blocked-state'
import { VideoPanel } from '@/components/attest/video-panel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useFormat } from '@/i18n/format'

/** Story "Isolated caucus" (R2, R8): same side only; sworn time pauses inside. */
export function CaucusPage() {
  const { t } = useTranslation()
  const fmt = useFormat()
  const { current } = useCurrentSession()
  const sid = current?.id ?? ''
  const rooms = useCaucus(current?.id)
  const open = useOpenCaucus(sid)
  const join = useJoinCaucus(sid)
  const leave = useLeaveCaucus(sid)
  const close = useCloseCaucus(sid)
  const error = open.error ?? join.error ?? leave.error ?? close.error

  if (!current) return <BlockedState title={t('hearing.noSessionTitle')} reason={t('hearing.noSessionReason')} />

  return (
    <>
      <PageHeader title={t('caucus.title')} description={t('caucus.description')} />
      <div className="grid max-w-3xl gap-6">
        {error && <BlockedState reason={describeError(error)} />}
        {rooms.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : rooms.isError ? (
          <BlockedState reason={describeError(rooms.error)} />
        ) : rooms.data.length === 0 ? (
          <Card>
            <CardHeader>
              <CardDescription>{t('caucus.none')}</CardDescription>
            </CardHeader>
            {current.recordState !== 'closed' && (
              <CardFooter>
                <Button disabled={open.isPending} onClick={() => open.mutate(undefined)}>
                  {t('caucus.open')}
                </Button>
              </CardFooter>
            )}
          </Card>
        ) : (
          rooms.data.map((room) => (
            <div key={room.id} className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>
                    {t('caucus.title')} · {t(`sides.${room.side}`)}
                  </CardTitle>
                  <CardDescription>{fmt.dateTime(room.openedAt)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {room.iAmIn && <p className="font-medium text-status-pending">{t('caucus.inRoom')}</p>}
                  <p className="text-sm text-muted-foreground">{t('caucus.members')}</p>
                  {room.members.length ? (
                    <ul className="list-inside list-disc text-sm">
                      {room.members.map((m) => (
                        <li key={m.participantId}>{m.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm">{t('caucus.nobody')}</p>
                  )}
                </CardContent>
                <CardFooter className="flex flex-wrap gap-2">
                  {room.iAmIn ? (
                    <Button disabled={leave.isPending} onClick={() => leave.mutate(room.id)}>
                      {t('caucus.leave')}
                    </Button>
                  ) : (
                    <Button disabled={join.isPending} onClick={() => join.mutate(room.id)}>
                      {t('caucus.join')}
                    </Button>
                  )}
                  {current.mySessionRole === 'counsel' && (
                    <Button variant="outline" disabled={close.isPending} onClick={() => close.mutate(room.id)}>
                      {t('caucus.close')}
                    </Button>
                  )}
                </CardFooter>
              </Card>
              {room.iAmIn && <VideoPanel sessionId={current.id} room={room.id} />}
            </div>
          ))
        )}
      </div>
    </>
  )
}
