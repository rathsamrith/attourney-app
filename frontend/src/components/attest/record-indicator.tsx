import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

const DOT: Record<string, string> = {
  open: 'bg-status-ok animate-pulse motion-reduce:animate-none',
  recess: 'bg-status-pending',
  off: 'bg-status-procedural',
  closed: 'bg-status-procedural',
}

/** Story "Record state": visible on every screen, driven only by the server's record_state. */
export function RecordIndicator({ state }: { state: string }) {
  const { t } = useTranslation()
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-2 text-sm font-medium">
      <span className={cn('size-2.5 shrink-0 rounded-full', DOT[state] ?? 'bg-status-procedural')} aria-hidden />
      {t(`record.${state}`, { defaultValue: state })}
    </span>
  )
}
