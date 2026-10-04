import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { describeError } from '@/api/client'
import { useAudit } from '@/api/queries'
import { useCurrentSession } from '@/app/context'
import { PageHeader } from '@/app/layout'
import { BlockedState } from '@/components/attest/blocked-state'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { intlLocale } from '@/i18n'

/** Story "Hash-chained audit" (R8, R7): every state change you are allowed to see, newest first. */
export function AuditPage() {
  const { t, i18n } = useTranslation()
  const { current } = useCurrentSession()
  const audit = useAudit(current?.id)
  const time = useMemo(
    () => new Intl.DateTimeFormat(intlLocale(i18n.resolvedLanguage), { dateStyle: 'medium', timeStyle: 'medium' }),
    [i18n.resolvedLanguage],
  )

  return (
    <>
      <PageHeader title={t('audit.title')} description={t('audit.description')} />
      {audit.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : audit.isError ? (
        <BlockedState title={t('audit.unavailableTitle')} reason={describeError(audit.error)} />
      ) : audit.data.length === 0 ? (
        <p className="text-muted-foreground">{t('audit.empty')}</p>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">{t('audit.colSeq')}</TableHead>
                  <TableHead>{t('audit.colWhen')}</TableHead>
                  <TableHead>{t('audit.colEvent')}</TableHead>
                  <TableHead>{t('audit.colBy')}</TableHead>
                  <TableHead>{t('audit.colHash')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.data.map((e) => (
                  <TableRow key={e.seq}>
                    <TableCell className="text-right font-mono tabular-nums text-muted-foreground">{e.seq}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{time.format(new Date(e.at))}</TableCell>
                    <TableCell>
                      {t(`audit.actions.${e.action.replaceAll('.', '_')}`, { defaultValue: e.action })}
                      <span className="block font-mono text-xs text-muted-foreground">{e.action}</span>
                    </TableCell>
                    <TableCell>{e.actorName ?? t('audit.system')}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground" title={e.hash}>
                      {e.hash.slice(0, 12)}…
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  )
}
