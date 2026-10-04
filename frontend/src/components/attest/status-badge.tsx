import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Tone = 'ok' | 'pending' | 'failed' | 'procedural'

const TONE_CLASS: Record<Tone, string> = {
  ok: 'border-status-ok/40 bg-status-ok/10 text-status-ok',
  pending: 'border-status-pending/40 bg-status-pending/10 text-status-pending',
  failed: 'border-status-failed/40 bg-status-failed/10 text-status-failed',
  procedural: 'border-status-procedural/40 bg-status-procedural/10 text-status-procedural',
}

/** Every domain state the UI shows, mapped to the spec's semantic palette. */
const TONE_OF: Record<string, Tone> = {
  // verification
  verified: 'ok',
  pending: 'pending',
  failed: 'failed',
  // presence
  present: 'ok',
  sidebar: 'ok',
  lobby: 'procedural',
  caucus: 'pending',
  absent: 'failed',
  // record state
  open: 'ok',
  recess: 'pending',
  off: 'procedural',
  closed: 'procedural',
  // rulings and decisions
  requested: 'pending',
  granted: 'ok',
  denied: 'failed',
  sustained: 'procedural',
  overruled: 'procedural',
  accepted: 'ok',
  rejected: 'failed',
  // exhibits: amber until ruled, green admitted, red excluded
  tagged: 'procedural',
  offered: 'pending',
  admitted: 'ok',
  excluded: 'failed',
}

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  const { t } = useTranslation()
  return (
    <Badge variant="outline" className={cn(TONE_CLASS[TONE_OF[value] ?? 'procedural'], className)}>
      {t(`status.${value}`, { defaultValue: value })}
    </Badge>
  )
}
