import { useTranslation } from 'react-i18next'
import { describeError } from '@/api/client'
import type { SessionDetailDto } from '@/api/generated'
import { useEndPublication, usePublication } from '@/api/queries'
import { BlockedState } from '@/components/attest/blocked-state'
import { ExhibitViewer } from '@/components/attest/exhibit-viewer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const CAN_END = ['counsel', 'presiding', 'officer']

/** Story "Publish exhibit": the shared viewer everyone in the session sees. */
export function PublicationPanel({ session }: { session: SessionDetailDto }) {
  const { t } = useTranslation()
  const publication = usePublication(session.id)
  const end = useEndPublication(session.id)
  const current = publication.data?.current

  // Nothing on screen: stay out of the way.
  if (!current) return null

  return (
    <Card className="border-primary/40">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>
            {t('proceeding.publication.title')}: <span className="font-mono">{current.label}</span> {current.title}
          </CardTitle>
          <CardDescription>{t('proceeding.publication.by', { name: current.publishedByName })}</CardDescription>
        </div>
        {CAN_END.includes(session.mySessionRole) && (
          <Button variant="outline" size="sm" disabled={end.isPending} onClick={() => end.mutate(undefined)}>
            {t('proceeding.publication.end')}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {end.isError && <BlockedState reason={describeError(end.error)} />}
        <ExhibitViewer exhibitId={current.exhibitId} title={`${current.label} ${current.title}`} />
      </CardContent>
    </Card>
  )
}
