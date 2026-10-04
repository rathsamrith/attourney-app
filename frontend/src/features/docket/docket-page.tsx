import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { describeError } from '@/api/client'
import type { DocketSessionDto, MetricDto } from '@/api/generated'
import { useDocket, useMetrics } from '@/api/queries'
import { PageHeader } from '@/app/layout'
import { BlockedState } from '@/components/attest/blocked-state'
import { RecordIndicator } from '@/components/attest/record-indicator'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useFormat } from '@/i18n/format'
import { cn } from '@/lib/utils'

const DAY = 86_400_000
const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/** Same semantic palette as everywhere else: green sealed, amber in progress, grey procedural. */
const SEAL_TONE: Record<DocketSessionDto['sealStatus'], string> = {
  in_progress: 'border-status-procedural/40 text-status-procedural',
  errata_open: 'border-status-pending/40 text-status-pending',
  ready_to_lock: 'border-status-pending/40 text-status-pending',
  locked: 'border-status-ok/40 text-status-ok',
  exported: 'border-status-ok/40 bg-status-ok/10 text-status-ok',
}

function MetricTile({ m }: { m: MetricDto }) {
  const { t } = useTranslation()
  const fmt = useFormat()
  const label = t(`docket.metrics.${m.key}`)
  const value =
    m.value === null
      ? t('docket.metrics.noData')
      : m.key === 'meanHoursToHashLock'
        ? t('docket.metrics.hoursValue', { n: fmt.decimal(m.value) })
        : m.key === 'objectionsPerSession'
          ? fmt.decimal(m.value)
          : fmt.percent(m.value)
  const detail =
    m.key === 'meanHoursToHashLock'
      ? t('docket.metrics.hoursDetail', { n: fmt.decimal(m.numerator), d: m.denominator })
      : m.key === 'objectionsPerSession'
        ? t('docket.metrics.perSessionDetail', { n: m.numerator, d: m.denominator })
        : t('docket.metrics.ratioDetail', { n: m.numerator, d: m.denominator })
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {/* Story "Summary metrics": each states its numerator, denominator and period. */}
      <p className="mt-1 text-xs text-muted-foreground tabular-nums">{detail}</p>
    </div>
  )
}

/** Epic E6: the record officer's week view and summary metrics. */
export function DocketPage() {
  const { t } = useTranslation()
  const fmt = useFormat()
  const [weekOf, setWeekOf] = useState(() => isoDay(new Date()))
  const docket = useDocket(weekOf)
  const metrics = useMetrics()
  const today = isoDay(new Date())
  const shift = (days: number) => setWeekOf(isoDay(new Date(new Date(`${weekOf}T00:00:00Z`).getTime() + days * DAY)))

  return (
    <>
      <PageHeader title={t('docket.title')} description={t('docket.description')} />
      <div className="grid gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" aria-label={t('docket.previous')} onClick={() => shift(-7)}>
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" onClick={() => setWeekOf(today)}>
            {t('docket.thisWeek')}
          </Button>
          <Button variant="outline" size="icon" aria-label={t('docket.next')} onClick={() => shift(7)}>
            <ChevronRightIcon />
          </Button>
          {docket.data && <span className="ml-2 text-sm text-muted-foreground">{t('docket.weekOf', { date: fmt.weekday(docket.data.weekStart) })}</span>}
        </div>

        {docket.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : docket.isError ? (
          <BlockedState reason={describeError(docket.error)} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {docket.data.days.map((d) => (
              <section
                key={d.date}
                aria-label={fmt.weekday(d.date)}
                className={cn('min-w-0 rounded-lg border p-3', d.date === today && 'border-primary ring-2 ring-primary/20')}
              >
                <h3 className="mb-2 flex items-center justify-between text-sm font-medium">
                  {fmt.weekday(d.date)}
                  {d.date === today && <Badge>{t('docket.today')}</Badge>}
                </h3>
                {d.sessions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('docket.none')}</p>
                ) : (
                  <ul className="space-y-2">
                    {d.sessions.map((s) => (
                      <li key={s.id} className="space-y-1 rounded-md bg-muted/50 p-2 text-sm">
                        <p className="font-mono text-xs">{s.docketNo}</p>
                        <p className="line-clamp-2">{s.caption}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('docket.dayNo', { n: s.dayNo })} · {fmt.time(s.startsAt)}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <RecordIndicator state={s.recordState} />
                          <Badge variant="outline" className={SEAL_TONE[s.sealStatus]}>
                            {t(`docket.sealStatus.${s.sealStatus}`)}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t('docket.metrics.title')}</CardTitle>
            {metrics.data?.[0] && (
              <CardDescription>
                {fmt.date(metrics.data[0].periodFrom)} – {fmt.date(metrics.data[0].periodTo)}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {metrics.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : metrics.isError ? (
              <BlockedState reason={describeError(metrics.error)} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {metrics.data.map((m) => (
                  <MetricTile key={m.key} m={m} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
