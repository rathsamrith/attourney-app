import { Room, RoomEvent, Track, type Participant, type VideoTrack } from 'livekit-client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { describeError } from '@/api/client'
import { fetchMediaToken } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BlockedState } from './blocked-state'

function Tile({ participant, local }: { participant: Participant; local: boolean }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLVideoElement>(null)
  const track = participant.getTrackPublication(Track.Source.Camera)?.track as VideoTrack | undefined

  useEffect(() => {
    const el = ref.current
    if (!track || !el) return
    track.attach(el)
    return () => {
      track.detach(el)
    }
  }, [track])

  return (
    <figure className="relative aspect-video overflow-hidden rounded-lg bg-muted">
      {track ? (
        <video ref={ref} autoPlay playsInline muted={local} className="size-full object-cover" />
      ) : (
        <div className="grid size-full place-items-center text-2xl font-semibold text-muted-foreground">
          {(participant.name ?? '?').slice(0, 1)}
        </div>
      )}
      <figcaption className="absolute bottom-1.5 left-1.5 rounded bg-background/80 px-1.5 py-0.5 text-xs">
        {local ? t('proceeding.video.you') : participant.name}
      </figcaption>
    </figure>
  )
}

/** Remote audio has no tile of its own; attach it to hidden elements. */
function useRemoteAudio(room: Room | undefined) {
  useEffect(() => {
    if (!room) return
    const attach = (track: Track) => {
      if (track.kind === Track.Kind.Audio) document.body.appendChild(track.attach())
    }
    const detach = (track: Track) => track.detach().forEach((el) => el.remove())
    room.on(RoomEvent.TrackSubscribed, attach)
    room.on(RoomEvent.TrackUnsubscribed, detach)
    return () => {
      room.off(RoomEvent.TrackSubscribed, attach)
      room.off(RoomEvent.TrackUnsubscribed, detach)
    }
  }, [room])
}

/**
 * Story "Video tiles". Joins the SFU room the API issues a token for: "hearing" or a
 * caucus room id. Media goes browser to SFU; the API only decides who may join.
 */
export function VideoPanel({ sessionId, room: roomKey }: { sessionId: string; room: string }) {
  const { t } = useTranslation()
  const [room, setRoom] = useState<Room>()
  const [, setVersion] = useState(0)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<unknown>()
  useRemoteAudio(room)

  const rerender = useCallback(() => setVersion((v) => v + 1), [])

  const join = async () => {
    setConnecting(true)
    setError(undefined)
    const r = new Room({ adaptiveStream: true, dynacast: true })
    try {
      const { url, token } = await fetchMediaToken(sessionId, roomKey)
      for (const ev of [
        RoomEvent.ParticipantConnected,
        RoomEvent.ParticipantDisconnected,
        RoomEvent.TrackSubscribed,
        RoomEvent.TrackUnsubscribed,
        RoomEvent.LocalTrackPublished,
      ]) {
        r.on(ev, rerender)
      }
      r.on(RoomEvent.Disconnected, () => setRoom(undefined))
      await r.connect(url, token)
      await r.localParticipant.enableCameraAndMicrophone()
      setRoom(r)
    } catch (err) {
      await r.disconnect()
      setError(err)
    } finally {
      setConnecting(false)
    }
  }

  // Leave the room when the panel unmounts or the target room changes.
  useEffect(() => () => void room?.disconnect(), [room])

  const remotes = room ? [...room.remoteParticipants.values()] : []

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t('proceeding.video.title')}</CardTitle>
        {room ? (
          <Button variant="outline" size="sm" onClick={() => void room.disconnect()}>
            {t('proceeding.video.leave')}
          </Button>
        ) : (
          <Button size="sm" disabled={connecting} onClick={() => void join()}>
            {connecting ? t('proceeding.video.connecting') : t('proceeding.video.join')}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {error !== undefined && <BlockedState reason={describeError(error)} />}
        {room && (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              <Tile participant={room.localParticipant} local />
              {remotes.map((p) => (
                <Tile key={p.identity} participant={p} local={false} />
              ))}
            </div>
            {remotes.length === 0 && <p className="text-sm text-muted-foreground">{t('proceeding.video.empty')}</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}
