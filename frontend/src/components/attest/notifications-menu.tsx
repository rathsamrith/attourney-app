import type { TFunction } from 'i18next'
import { BellIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useNotifications } from '@/api/queries'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useFormat } from '@/i18n/format'

const actionLabel = (t: TFunction, action: string) =>
  t(`audit.actions.${action.replaceAll('.', '_')}`, { defaultValue: action })

/** Story "Role notifications": derived from audit events; new ones also appear as a toast. */
export function NotificationsMenu({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation()
  const fmt = useFormat()
  const { data = [] } = useNotifications(sessionId)
  const [seenSeq, setSeenSeq] = useState<string>()
  const lastToasted = useRef<string>(undefined)
  const newest = data[0]?.seq
  const unread = seenSeq === undefined ? 0 : data.filter((n) => BigInt(n.seq) > BigInt(seenSeq)).length

  useEffect(() => {
    if (!newest) return
    // First load marks everything seen; later arrivals are toasted once.
    if (seenSeq === undefined) {
      setSeenSeq(newest)
      lastToasted.current = newest
      return
    }
    if (lastToasted.current && BigInt(newest) > BigInt(lastToasted.current)) {
      toast(actionLabel(t, data[0].action), { description: data[0].actorName ?? undefined })
      lastToasted.current = newest
    }
  }, [newest, seenSeq, data, t])

  return (
    <DropdownMenu onOpenChange={(open) => open && newest && setSeenSeq(newest)}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('notifications.title')} className="relative">
          <BellIcon />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] leading-4 text-white tabular-nums">
              {unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 w-80 overflow-y-auto">
        <DropdownMenuLabel>{t('notifications.title')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {data.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">{t('notifications.empty')}</p>
        ) : (
          data.map((n) => (
            <DropdownMenuItem key={n.seq} className="flex flex-col items-start gap-0.5">
              <span>{actionLabel(t, n.action)}</span>
              <span className="text-xs text-muted-foreground">
                {n.actorName && `${n.actorName} · `}
                {fmt.time(n.at)}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
