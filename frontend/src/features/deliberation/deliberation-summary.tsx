import { useTranslation } from 'react-i18next'
import type { DeliberationDto } from '@/api/generated'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useFormat } from '@/i18n/format'

/** Seal progress for everyone; contents only after the simultaneous reveal (R6). */
export function DeliberationSummary({ state }: { state: DeliberationDto }) {
  const { t } = useTranslation()
  const fmt = useFormat()
  if (state.panelSize === 0) return null
  const pct = Math.round((state.sealedCount / state.panelSize) * 100)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('deliberation.title')}</CardTitle>
        <CardDescription>{t('deliberation.progress', { sealed: state.sealedCount, size: state.panelSize })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={state.panelSize}
          aria-valuenow={state.sealedCount}
        >
          <div className="h-full bg-status-ok transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        {state.revealed ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t('deliberation.revealedAt', { date: fmt.dateTime(state.revealed.revealedAt) })}</p>
            <p className="text-lg font-semibold">
              {t('deliberation.outcome')}: {t(`deliberation.outcomes.${state.revealed.outcome}`)}
            </p>
            <ul className="divide-y text-sm">
              {state.revealed.votes.map((v) => (
                <li key={v.panelistName} className="flex justify-between gap-3 py-1.5">
                  <span>{v.panelistName}</span>
                  <span className="text-muted-foreground">{t(`deliberation.choices.${v.choice}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('deliberation.hidden')}</p>
        )}
      </CardContent>
    </Card>
  )
}
