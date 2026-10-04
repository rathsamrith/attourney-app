import { createContext, useContext, useState, type ReactNode } from 'react'
import type { MeDto, SessionSummaryDto } from '@/api/generated'
import { useSessions } from '@/api/queries'

const MeContext = createContext<MeDto | null>(null)

export function MeProvider({ me, children }: { me: MeDto; children: ReactNode }) {
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>
}

export function useCurrentUser(): MeDto {
  const me = useContext(MeContext)
  if (!me) throw new Error('useCurrentUser must be used inside MeProvider')
  return me
}

interface SessionCtx {
  sessions: SessionSummaryDto[]
  current: SessionSummaryDto | undefined
  select: (id: string) => void
  isLoading: boolean
}

const SessionContext = createContext<SessionCtx | null>(null)

/** The session the user is working in. Defaults to their earliest session. */
export function CurrentSessionProvider({ children }: { children: ReactNode }) {
  const { data = [], isLoading } = useSessions()
  const [selectedId, select] = useState<string>()
  const current = data.find((s) => s.id === selectedId) ?? data[0]
  return (
    <SessionContext.Provider value={{ sessions: data, current, select, isLoading }}>{children}</SessionContext.Provider>
  )
}

export function useCurrentSession(): SessionCtx {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useCurrentSession must be used inside CurrentSessionProvider')
  return ctx
}
