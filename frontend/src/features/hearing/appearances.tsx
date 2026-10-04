import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { describeError } from '@/api/client'
import type { SessionDetailDto } from '@/api/generated'
import { useSetPresence } from '@/api/queries'
import { NativeSelect } from '@/components/attest/form'
import { StatusBadge } from '@/components/attest/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

/** Seconds as h:mm:ss, the way a court reporter logs time. */
export function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const OFFICER_PRESENCE = ['present', 'sidebar', 'absent'] as const

/** Story "Sworn time accrual": the appearance list, with presence controls for the record officer. */
export function Appearances({ session }: { session: SessionDetailDto }) {
  const { t } = useTranslation()
  const setPresence = useSetPresence(session.id)
  const isOfficer = session.mySessionRole === 'officer' && session.recordState !== 'closed'

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{t('hearing.appearances')}</CardTitle>
        <CardDescription>{t('hearing.participantCount', { count: session.participants.length })}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('hearing.colName')}</TableHead>
              <TableHead>{t('hearing.colAppearingAs')}</TableHead>
              <TableHead>{t('hearing.colIdentity')}</TableHead>
              <TableHead>{t('hearing.colPresence')}</TableHead>
              <TableHead className="text-right">{t('hearing.colSwornTime')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {session.participants.map((p) => {
              const editable = isOfficer && p.sworn && p.presence !== 'caucus' && p.presence !== 'lobby'
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {t(`sessionRoles.${p.sessionRole}`)} · {t(`sides.${p.side}`)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={p.verification} />
                  </TableCell>
                  <TableCell>
                    {editable ? (
                      <NativeSelect
                        aria-label={t('proceeding.setPresence', { name: p.name })}
                        className="h-8 w-auto"
                        value={p.presence}
                        disabled={setPresence.isPending}
                        onChange={(e) =>
                          setPresence.mutate(
                            { participantId: p.id, state: e.target.value as (typeof OFFICER_PRESENCE)[number] },
                            { onError: (err) => toast.error(describeError(err)) },
                          )
                        }
                      >
                        {OFFICER_PRESENCE.map((s) => (
                          <option key={s} value={s}>
                            {t(`status.${s}`)}
                          </option>
                        ))}
                      </NativeSelect>
                    ) : (
                      <StatusBadge value={p.presence} />
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatDuration(p.swornSeconds)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
