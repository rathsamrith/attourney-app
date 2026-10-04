import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  auditList,
  authMe,
  checkinAdmit,
  checkinIdentity,
  checkinManual,
  checkinOath,
  checkinQueue,
  checkinStatus,
  deliberationCast,
  deliberationSeal,
  deliberationState,
  docketMetrics,
  docketWeek,
  exhibitsCurrent,
  exhibitsList,
  exhibitsOffer,
  exhibitsPublish,
  exhibitsRule,
  exhibitsTag,
  exhibitsUnpublish,
  notificationsList,
  proceedingAddLine,
  proceedingCloseCaucus,
  proceedingCorrectLine,
  proceedingJoinCaucus,
  proceedingLeaveCaucus,
  proceedingListCaucus,
  proceedingListContinuances,
  proceedingListObjections,
  proceedingListTranscript,
  proceedingMediaToken,
  proceedingOpenCaucus,
  proceedingRaiseObjection,
  proceedingRequestContinuance,
  proceedingRuleContinuance,
  proceedingRuleObjection,
  recordCloseWindow,
  recordDecide,
  recordExport,
  recordFile,
  recordLock,
  recordStatus,
  sessionsGet,
  sessionsList,
  sessionsSetPresence,
  sessionsSetRecordState,
} from './generated'
import type {
  AddTranscriptLineDto,
  CastBallotDto,
  FileErratumDto,
  IdentityAttemptDto,
  RaiseObjectionDto,
  RequestContinuanceDto,
  SetPresenceDto,
  SetRecordStateDto,
} from './generated'

/**
 * Everything about one session lives under ['session', id], so a realtime event for the
 * session refreshes all of it with one invalidation (see realtime.ts).
 */
export const keys = {
  me: ['me'] as const,
  sessions: ['sessions'] as const,
  session: (id: string) => ['session', id] as const,
  part: (id: string, part: string) => ['session', id, part] as const,
  docket: (weekOf: string) => ['docket', weekOf] as const,
  metrics: ['docket', 'metrics'] as const,
}

const T = { throwOnError: true } as const

export function useMe(enabled = true) {
  return useQuery({ queryKey: keys.me, queryFn: async () => (await authMe(T)).data, enabled, retry: false })
}

export function useSessions() {
  return useQuery({ queryKey: keys.sessions, queryFn: async () => (await sessionsList(T)).data })
}

/** A query for one part of a session, disabled until the session id is known. */
function useSessionPart<R>(id: string | undefined, part: string, fn: (id: string) => Promise<R>) {
  return useQuery({ queryKey: keys.part(id ?? '', part), queryFn: () => fn(id!), enabled: !!id })
}

export const useSession = (id?: string) =>
  useSessionPart(id, 'detail', async (id) => (await sessionsGet({ path: { id }, ...T })).data)
export const useAudit = (id?: string) =>
  useSessionPart(id, 'audit', async (id) => (await auditList({ query: { sessionId: id }, ...T })).data)
export const useCheckin = (id?: string) =>
  useSessionPart(id, 'checkin', async (id) => (await checkinStatus({ path: { id }, ...T })).data)
export const useCheckinQueue = (id?: string, enabled = true) =>
  useQuery({
    queryKey: keys.part(id ?? '', 'checkin-queue'),
    queryFn: async () => (await checkinQueue({ path: { id: id! }, ...T })).data,
    enabled: !!id && enabled,
  })
export const useObjections = (id?: string) =>
  useSessionPart(id, 'objections', async (id) => (await proceedingListObjections({ path: { id }, ...T })).data)
export const useContinuances = (id?: string) =>
  useSessionPart(id, 'continuances', async (id) => (await proceedingListContinuances({ path: { id }, ...T })).data)
export const useCaucus = (id?: string) =>
  useSessionPart(id, 'caucus', async (id) => (await proceedingListCaucus({ path: { id }, ...T })).data)
export const useTranscript = (id?: string) =>
  useSessionPart(id, 'transcript', async (id) => (await proceedingListTranscript({ path: { id }, ...T })).data)
export const useExhibits = (id?: string) =>
  useSessionPart(id, 'exhibits', async (id) => (await exhibitsList({ path: { id }, ...T })).data)
export const usePublication = (id?: string) =>
  useSessionPart(id, 'publication', async (id) => (await exhibitsCurrent({ path: { id }, ...T })).data)
export const useDeliberation = (id?: string) =>
  useSessionPart(id, 'deliberation', async (id) => (await deliberationState({ path: { id }, ...T })).data)
export const useRecord = (id?: string) =>
  useSessionPart(id, 'record', async (id) => (await recordStatus({ path: { id }, ...T })).data)
export const useNotifications = (id?: string) =>
  useSessionPart(id, 'notifications', async (id) => (await notificationsList({ path: { id }, ...T })).data)

export function useDocket(weekOf: string) {
  return useQuery({ queryKey: keys.docket(weekOf), queryFn: async () => (await docketWeek({ query: { weekOf }, ...T })).data })
}

export function useMetrics() {
  return useQuery({ queryKey: keys.metrics, queryFn: async () => (await docketMetrics({ query: {}, ...T })).data })
}

/**
 * A mutation that refreshes the whole session afterwards. The realtime event does the
 * same for everyone else; the actor shouldn't wait for that round trip.
 */
function useSessionCommand<V, R>(sessionId: string | undefined, fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      if (sessionId) void qc.invalidateQueries({ queryKey: keys.session(sessionId) })
      void qc.invalidateQueries({ queryKey: keys.sessions })
    },
  })
}

// ---------- session and check-in ----------

export const useSetRecordState = (sid: string) =>
  useSessionCommand(sid, (state: SetRecordStateDto['state']) => sessionsSetRecordState({ path: { id: sid }, body: { state }, ...T }))
export const useSetPresence = (sid: string) =>
  useSessionCommand(sid, (v: { participantId: string; state: SetPresenceDto['state'] }) =>
    sessionsSetPresence({ path: { id: v.participantId }, body: { state: v.state }, ...T }),
  )
export const useVerifyIdentity = (sid: string) =>
  useSessionCommand(sid, async (body: IdentityAttemptDto) => (await checkinIdentity({ path: { id: sid }, body, ...T })).data)
export const useAffirmOath = (sid: string) => useSessionCommand(sid, () => checkinOath({ path: { id: sid }, ...T }))
export const useManualVerify = (sid: string) =>
  useSessionCommand(sid, (v: { participantId: string; documentChecked: string }) =>
    checkinManual({ path: { id: v.participantId }, body: { documentChecked: v.documentChecked }, ...T }),
  )
export const useAdmit = (sid: string) =>
  useSessionCommand(sid, (participantId: string) => checkinAdmit({ path: { id: participantId }, ...T }))

// ---------- proceeding ----------

export const useRaiseObjection = (sid: string) =>
  useSessionCommand(sid, (body: RaiseObjectionDto) => proceedingRaiseObjection({ path: { id: sid }, body, ...T }))
export const useRuleObjection = (sid: string) =>
  useSessionCommand(sid, (v: { id: string; ruling: 'sustained' | 'overruled' }) =>
    proceedingRuleObjection({ path: { id: v.id }, body: { ruling: v.ruling }, ...T }),
  )
export const useRequestContinuance = (sid: string) =>
  useSessionCommand(sid, (body: RequestContinuanceDto) => proceedingRequestContinuance({ path: { id: sid }, body, ...T }))
export const useRuleContinuance = (sid: string) =>
  useSessionCommand(sid, (v: { id: string; status: 'granted' | 'denied' }) =>
    proceedingRuleContinuance({ path: { id: v.id }, body: { status: v.status }, ...T }),
  )
export const useOpenCaucus = (sid: string) => useSessionCommand(sid, () => proceedingOpenCaucus({ path: { id: sid }, ...T }))
export const useJoinCaucus = (sid: string) =>
  useSessionCommand(sid, (roomId: string) => proceedingJoinCaucus({ path: { id: roomId }, ...T }))
export const useLeaveCaucus = (sid: string) =>
  useSessionCommand(sid, (roomId: string) => proceedingLeaveCaucus({ path: { id: roomId }, ...T }))
export const useCloseCaucus = (sid: string) =>
  useSessionCommand(sid, (roomId: string) => proceedingCloseCaucus({ path: { id: roomId }, ...T }))
export const useAddLine = (sid: string) =>
  useSessionCommand(sid, (body: AddTranscriptLineDto) => proceedingAddLine({ path: { id: sid }, body, ...T }))
export const useCorrectLine = (sid: string) =>
  useSessionCommand(sid, (v: { id: string; text: string }) => proceedingCorrectLine({ path: { id: v.id }, body: { text: v.text }, ...T }))

export async function fetchMediaToken(sessionId: string, room: string) {
  return (await proceedingMediaToken({ path: { id: sessionId }, body: { room }, ...T })).data
}

// ---------- exhibits ----------

export const useTagExhibit = (sid: string) =>
  useSessionCommand(sid, (v: { title: string; file: File }) =>
    exhibitsTag({ body: { sessionId: sid, title: v.title, file: v.file }, ...T }),
  )
export const useOfferExhibit = (sid: string) =>
  useSessionCommand(sid, (id: string) => exhibitsOffer({ path: { id }, body: { sessionId: sid }, ...T }))
export const useRuleExhibit = (sid: string) =>
  useSessionCommand(sid, (v: { id: string; ruling: 'admitted' | 'excluded' }) =>
    exhibitsRule({ path: { id: v.id }, body: { sessionId: sid, ruling: v.ruling }, ...T }),
  )
export const usePublishExhibit = (sid: string) =>
  useSessionCommand(sid, (id: string) => exhibitsPublish({ path: { id }, body: { sessionId: sid }, ...T }))
export const useEndPublication = (sid: string) => useSessionCommand(sid, () => exhibitsUnpublish({ path: { id: sid }, ...T }))

// ---------- deliberation ----------

export const useCastBallot = (sid: string) =>
  useSessionCommand(sid, (choice: CastBallotDto['choice']) => deliberationCast({ path: { id: sid }, body: { choice }, ...T }))
export const useSealBallot = (sid: string) => useSessionCommand(sid, () => deliberationSeal({ path: { id: sid }, ...T }))

// ---------- record integrity ----------

export const useFileErratum = (sid: string) =>
  useSessionCommand(sid, (body: FileErratumDto) => recordFile({ path: { id: sid }, body, ...T }))
export const useDecideErratum = (sid: string) =>
  useSessionCommand(sid, (v: { id: string; status: 'accepted' | 'rejected' }) =>
    recordDecide({ path: { id: v.id }, body: { status: v.status }, ...T }),
  )
export const useCloseErrata = (sid: string) => useSessionCommand(sid, () => recordCloseWindow({ path: { id: sid }, ...T }))
export const useLockTranscript = (sid: string) => useSessionCommand(sid, () => recordLock({ path: { id: sid }, ...T }))
export const useExportRecord = (sid: string) => useSessionCommand(sid, () => recordExport({ path: { id: sid }, ...T }))
