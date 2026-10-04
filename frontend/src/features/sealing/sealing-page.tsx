import { DownloadIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { describeError, fetchFileUrl } from '@/api/client'
import type { RecordStatusDto } from '@/api/generated'
import { useCloseErrata, useDecideErratum, useExportRecord, useLockTranscript, useRecord } from '@/api/queries'
import { useCurrentSession } from '@/app/context'
import { PageHeader } from '@/app/layout'
import { BlockedState } from '@/components/attest/blocked-state'
import { StatusBadge } from '@/components/attest/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useFormat } from '@/i18n/format'

function ErrataCard({ sessionId, record }: { sessionId: string; record: RecordStatusDto }) {
  const { t } = useTranslation()
  const fmt = useFormat()
  const decide = useDecideErratum(sessionId)
  const close = useCloseErrata(sessionId)
  const seal = record.seal!
  const error = decide.error ?? close.error

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{t('sealing.errata.title')}</CardTitle>
        <CardDescription>
          {seal.errataClosedAt
            ? t('sealing.errata.closedAt', { date: fmt.dateTime(seal.errataClosedAt) })
            : t('sealing.errata.deadline', { date: fmt.dateTime(seal.errataDeadline) })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 overflow-x-auto">
        {error && <BlockedState reason={describeError(error)} />}
        {record.errata.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('sealing.errata.empty')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">{t('sealing.errata.colLine')}</TableHead>
                <TableHead>{t('sealing.errata.colOriginal')}</TableHead>
                <TableHead>{t('sealing.errata.colCorrected')}</TableHead>
                <TableHead>{t('sealing.errata.colKind')}</TableHead>
                <TableHead>{t('sealing.errata.colFiledBy')}</TableHead>
                <TableHead>{t('sealing.errata.colStatus')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {record.errata.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-right font-mono tabular-nums">{e.lineSeq}</TableCell>
                  <TableCell className="min-w-40 whitespace-normal text-muted-foreground line-through decoration-status-failed/60">{e.original}</TableCell>
                  <TableCell className="min-w-40 whitespace-normal">{e.corrected}</TableCell>
                  <TableCell>{t(`proceeding.transcript.erratumKinds.${e.kind}`)}</TableCell>
                  <TableCell>{e.filedByName}</TableCell>
                  <TableCell>
                    {e.status === 'pending' && seal.errataWindowOpen ? (
                      <div className="flex gap-2">
                        <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: e.id, status: 'accepted' })}>
                          {t('sealing.errata.accept')}
                        </Button>
                        <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: e.id, status: 'rejected' })}>
                          {t('sealing.errata.reject')}
                        </Button>
                      </div>
                    ) : (
                      <StatusBadge value={e.status} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {seal.errataWindowOpen && (
        <CardFooter>
          <Button variant="outline" disabled={close.isPending} onClick={() => close.mutate(undefined)}>
            {t('sealing.errata.close')}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}

function LockCard({ sessionId, record }: { sessionId: string; record: RecordStatusDto }) {
  const { t } = useTranslation()
  const fmt = useFormat()
  const lock = useLockTranscript(sessionId)
  const seal = record.seal!

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{t('sealing.lock.title')}</CardTitle>
        {seal.lockedAt && (
          <CardDescription>{t('sealing.lock.lockedBy', { name: seal.lockedByName, date: fmt.dateTime(seal.lockedAt) })}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {seal.digestSha256 ? (
          <dl className="grid gap-2 text-sm">
            <dt className="text-muted-foreground">{t('sealing.lock.digest')}</dt>
            {/* Shown in full after locking (story "Lock transcript"). */}
            <dd className="break-all rounded-md bg-muted p-2 font-mono text-xs">{seal.digestSha256}</dd>
            {seal.signature && (
              <>
                <dt className="text-muted-foreground">{t('sealing.lock.signature')}</dt>
                <dd className="break-all rounded-md bg-muted p-2 font-mono text-xs">{seal.signature}</dd>
              </>
            )}
          </dl>
        ) : seal.errataWindowOpen ? (
          // R4: shown as blocked while the window is open.
          <BlockedState reason={t('blocked.seal.windowOpen')} />
        ) : (
          <Button disabled={lock.isPending} onClick={() => lock.mutate(undefined)}>
            {t('sealing.lock.lock')}
          </Button>
        )}
        {lock.isError && <BlockedState reason={describeError(lock.error)} />}
      </CardContent>
    </Card>
  )
}

function ExportCard({ sessionId, record }: { sessionId: string; record: RecordStatusDto }) {
  const { t } = useTranslation()
  const fmt = useFormat()
  const create = useExportRecord(sessionId)

  const download = async (id: string, sha: string) => {
    try {
      const url = await fetchFileUrl(`/api/exports/${id}/file`)
      const a = document.createElement('a')
      a.href = url
      a.download = `attest-certified-${sha.slice(0, 12)}.zip`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (err) {
      toast.error(describeError(err))
    }
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{t('sealing.export.title')}</CardTitle>
        <CardDescription>{t('sealing.export.help')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* R5: shown as blocked until locked. */}
        {!record.seal?.lockedAt ? (
          <BlockedState reason={t('blocked.export.notLocked')} />
        ) : (
          <Button disabled={create.isPending} onClick={() => create.mutate(undefined)}>
            {t('sealing.export.create')}
          </Button>
        )}
        {create.isError && <BlockedState reason={describeError(create.error)} />}
        {record.exports.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('sealing.export.empty')}</p>
        ) : (
          <ul className="divide-y">
            {record.exports.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <p>{t('sealing.export.by', { name: x.exportedByName, date: fmt.dateTime(x.exportedAt) })}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground" title={x.manifestSha256}>
                    {t('sealing.export.manifest')}: {x.manifestSha256}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => void download(x.id, x.manifestSha256)}>
                  <DownloadIcon />
                  {t('sealing.export.download')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** Epic E5: errata, hash lock and certified export (R4, R5). */
export function SealingPage() {
  const { t } = useTranslation()
  const { current } = useCurrentSession()
  const record = useRecord(current?.id)

  if (!current) return <BlockedState title={t('hearing.noSessionTitle')} reason={t('hearing.noSessionReason')} />
  if (record.isPending) return <Skeleton className="h-64 w-full" />
  if (record.isError) return <BlockedState reason={describeError(record.error)} />

  return (
    <>
      <PageHeader title={t('sealing.title')} description={t('sealing.description')} />
      {!record.data.seal ? (
        <BlockedState reason={t('sealing.notClosed')} />
      ) : (
        <div className="grid gap-6">
          <ErrataCard sessionId={current.id} record={record.data} />
          <div className="grid gap-6 lg:grid-cols-2">
            <LockCard sessionId={current.id} record={record.data} />
            <ExportCard sessionId={current.id} record={record.data} />
          </div>
        </div>
      )}
    </>
  )
}
