import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { describeError } from '@/api/client'
import type { ExhibitDto } from '@/api/generated'
import { useExhibits, useOfferExhibit, usePublishExhibit, useRuleExhibit, useTagExhibit } from '@/api/queries'
import { useCurrentSession } from '@/app/context'
import { PageHeader } from '@/app/layout'
import { BlockedState } from '@/components/attest/blocked-state'
import { ExhibitViewer } from '@/components/attest/exhibit-viewer'
import { Field, Segmented } from '@/components/attest/form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const TABS = ['tagged', 'offered', 'admitted', 'excluded'] as const
type Tab = (typeof TABS)[number]

function UploadForm({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation()
  const tag = useTagExhibit(sessionId)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File>()
  const [formKey, setFormKey] = useState(0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('exhibits.upload.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          key={formKey}
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            if (!file) return
            tag.mutate(
              { title: title.trim(), file },
              {
                onSuccess: () => {
                  setTitle('')
                  setFile(undefined)
                  setFormKey((k) => k + 1)
                },
              },
            )
          }}
        >
          <Field label={t('exhibits.upload.name')} htmlFor="exhibit-title">
            <Input id="exhibit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label={t('exhibits.upload.file')} htmlFor="exhibit-file">
            <Input id="exhibit-file" type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0])} />
          </Field>
          <Button type="submit" disabled={!file || title.trim().length < 2 || tag.isPending}>
            {t('exhibits.upload.submit')}
          </Button>
        </form>
        {tag.isError && (
          <div className="mt-3">
            <BlockedState reason={describeError(tag.error)} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Actions({ exhibit, sessionId, role }: { exhibit: ExhibitDto; sessionId: string; role: string }) {
  const { t } = useTranslation()
  const offer = useOfferExhibit(sessionId)
  const rule = useRuleExhibit(sessionId)
  const publish = usePublishExhibit(sessionId)
  const [confirmOffer, setConfirmOffer] = useState(false)
  const onError = (err: unknown) => toast.error(describeError(err))

  if (role === 'counsel' && exhibit.mine && exhibit.status === 'tagged') {
    return confirmOffer ? (
      <Alert className="max-w-sm">
        <AlertDescription className="space-y-2">
          <p>{t('exhibits.offerConfirm')}</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={offer.isPending} onClick={() => offer.mutate(exhibit.id, { onError, onSettled: () => setConfirmOffer(false) })}>
              {t('exhibits.offerConfirmButton')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmOffer(false)}>
              {t('exhibits.cancel')}
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    ) : (
      <Button size="sm" variant="outline" onClick={() => setConfirmOffer(true)}>
        {t('exhibits.offer')}
      </Button>
    )
  }
  if (role === 'presiding' && exhibit.status === 'offered') {
    return (
      <div className="flex gap-2">
        <Button size="sm" disabled={rule.isPending} onClick={() => rule.mutate({ id: exhibit.id, ruling: 'admitted' }, { onError })}>
          {t('exhibits.admit')}
        </Button>
        <Button size="sm" variant="outline" disabled={rule.isPending} onClick={() => rule.mutate({ id: exhibit.id, ruling: 'excluded' }, { onError })}>
          {t('exhibits.exclude')}
        </Button>
      </div>
    )
  }
  if (role === 'counsel' && exhibit.status === 'admitted') {
    return (
      <Button size="sm" variant="outline" disabled={publish.isPending} onClick={() => publish.mutate(exhibit.id, { onError })}>
        {t('exhibits.publish')}
      </Button>
    )
  }
  return null
}

/** Epic E3: tag privately, offer, admit or exclude, publish (R7). */
export function ExhibitsPage() {
  const { t } = useTranslation()
  const { current } = useCurrentSession()
  const exhibits = useExhibits(current?.id)
  const [tab, setTab] = useState<Tab>('tagged')
  const [viewing, setViewing] = useState<ExhibitDto>()

  if (!current) return <BlockedState title={t('hearing.noSessionTitle')} reason={t('hearing.noSessionReason')} />
  const role = current.mySessionRole
  const all = exhibits.data ?? []
  const rows = all.filter((e) => e.status === tab)

  return (
    <>
      <PageHeader title={t('exhibits.title')} description={t('exhibits.description')} />
      <div className="grid gap-6">
        {role === 'counsel' && <UploadForm sessionId={current.id} />}

        <Segmented
          label={t('exhibits.title')}
          value={tab}
          onChange={setTab}
          options={TABS.map((s) => ({ value: s, label: t(`exhibits.tabs.${s}`), count: all.filter((e) => e.status === s).length }))}
        />

        {exhibits.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : exhibits.isError ? (
          <BlockedState reason={describeError(exhibits.error)} />
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground">{t('exhibits.empty')}</p>
        ) : (
          <Card>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('exhibits.colLabel')}</TableHead>
                    <TableHead>{t('exhibits.colTitle')}</TableHead>
                    <TableHead className="text-right">{t('exhibits.colPages')}</TableHead>
                    <TableHead>{t('exhibits.colSide')}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono whitespace-nowrap">{e.label}</TableCell>
                      <TableCell className="min-w-48">
                        {e.title}
                        {e.mine && (
                          <Badge variant="secondary" className="ml-2">
                            {t('exhibits.yours')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{e.pages}</TableCell>
                      <TableCell>{t(`sides.${e.side}`)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setViewing(e)}>
                            {t('exhibits.view')}
                          </Button>
                          <Actions exhibit={e} sessionId={current.id} role={role} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {viewing && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>
                <span className="font-mono">{viewing.label}</span> {viewing.title}
              </CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setViewing(undefined)}>
                {t('exhibits.close')}
              </Button>
            </CardHeader>
            <CardContent>
              <ExhibitViewer exhibitId={viewing.id} title={`${viewing.label} ${viewing.title}`} />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
