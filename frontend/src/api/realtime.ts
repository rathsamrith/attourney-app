import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { io, type Socket } from 'socket.io-client'
import { getAccessToken } from './client'
import { keys } from './queries'

/** Mirrors backend/src/audit/domain-events.ts. */
export interface DomainEvent {
  seq: string
  at: string
  action: string
  entity: string
  entityId: string | null
  matterId: string | null
  sessionId: string | null
}

let socket: Socket | undefined

function getSocket() {
  // auth is a function so reconnects pick up a renewed token.
  socket ??= io({ path: '/socket.io', auth: (cb) => cb({ token: getAccessToken() }) })
  return socket
}

/**
 * Joins the session's room and refetches whatever an incoming event touches.
 * Events carry no content; the REST API stays the only source of data.
 */
export function useSessionEvents(sessionId: string | undefined) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!sessionId) return
    const s = getSocket()
    const join = () => s.emit('session:join', { sessionId })
    const onEvent = (e: DomainEvent) => {
      if (e.sessionId !== sessionId) return
      void qc.invalidateQueries({ queryKey: keys.session(sessionId) })
      void qc.invalidateQueries({ queryKey: keys.sessions })
      if (e.action === 'session.closed' || e.action.startsWith('seal.') || e.action.startsWith('export.')) {
        void qc.invalidateQueries({ queryKey: ['docket'] })
      }
    }

    join()
    s.on('connect', join)
    s.on('event', onEvent)
    return () => {
      s.emit('session:leave', { sessionId })
      s.off('connect', join)
      s.off('event', onEvent)
    }
  }, [sessionId, qc])
}
