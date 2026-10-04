import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { describeError } from '@/api/client'
import type { AddTranscriptLineDto, SessionDetailDto, TranscriptLineDto } from '@/api/generated'
import { useAddLine, useCorrectLine, useFileErratum, useRecord, useTranscript } from '@/api/queries'
import { BlockedState } from '@/components/attest/blocked-state'
import { Field, NativeSelect, Textarea } from '@/components/attest/form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useFormat } from '@/i18n/format'

const KINDS = ['q', 'a', 'colloquy', 'procedural'] as const
const WRITERS = ['reporter', 'officer']
const ERRATA_FILERS = ['witness', 'counsel', 'reporter', 'officer']

function AddLineForm({ session }: { session: SessionDetailDto }) {
  const { t } = useTranslation()
  const add = useAddLine(session.id)
  const [kind, setKind] = useState<AddTranscriptLineDto['kind']>('q')
  const [speakerId, setSpeakerId] = useState('')
  const [text, setText] = useState('')

  return (
    <form
      className="grid gap-3 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault()
        add.mutate(
          { kind, text: text.trim(), ...(speakerId && { speakerId }) },
          { onSuccess: () => setText('') },
        )
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('proceeding.transcript.speaker')} htmlFor="line-speaker">
          <NativeSelect id="line-speaker" value={speakerId} onChange={(e) => setSpeakerId(e.target.value)}>
            <option value="">{t('proceeding.transcript.noSpeaker')}</option>
            {session.participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={t('proceeding.transcript.kind')} htmlFor="line-kind">
          <NativeSelect id="line-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`proceeding.transcript.kinds.${k}`)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field label={t('proceeding.transcript.text')} htmlFor="line-text">
        <Textarea id="line-text" value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      {add.isError && <BlockedState reason={describeError(add.error)} />}
      <div>
        <Button type="submit" disabled={!text.trim() || add.isPending}>
          {t('proceeding.transcript.submit')}
        </Button>
      </div>
    </form>
  )
}

function LineEditor({
  line,
  mode,
  sessionId,
  onDone,
}: {
  line: TranscriptLineDto
  mode: 'correct' | 'erratum'
  sessionId: string
  onDone: () => void
}) {
  const { t } = useTranslation()
  const correct = useCorrectLine(sessionId)
  const fileErratum = useFileErratum(sessionId)
  const [text, setText] = useState(line.text)
  const [kind, setKind] = useState<'transcription' | 'substantive'>('transcription')
  const pending = correct.isPending || fileErratum.isPending
  const error = correct.error ?? fileErratum.error
  const id = `edit-${line.id}`

  const submit = () => {
    if (mode === 'correct') correct.mutate({ id: line.id, text: text.trim() }, { onSuccess: onDone })
    else
      fileErratum.mutate(
        { transcriptLineId: line.id, corrected: text.trim(), kind },
        {
          onSuccess: () => {
            toast.success(t('proceeding.transcript.erratumFiled'))
            onDone()
          },
        },
      )
  }

  return (
    <div className="mt-2 grid gap-2">
      <Field label={t('proceeding.transcript.correctedText')} htmlFor={id}>
        <Textarea id={id} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      {mode === 'erratum' && (
        <Field label={t('proceeding.transcript.erratumKind')} htmlFor={`${id}-kind`}>
          <NativeSelect id={`${id}-kind`} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="transcription">{t('proceeding.transcript.erratumKinds.transcription')}</option>
            <option value="substantive">{t('proceeding.transcript.erratumKinds.substantive')}</option>
          </NativeSelect>
        </Field>
      )}
      {error && <BlockedState reason={describeError(error)} />}
      <div className="flex gap-2">
        <Button size="sm" disabled={!text.trim() || text.trim() === line.text || pending} onClick={submit}>
          {mode === 'correct' ? t('proceeding.transcript.saveCorrection') : t('proceeding.transcript.fileErratum')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t('proceeding.transcript.cancel')}
        </Button>
      </div>
    </div>
  )
}

/** Story "Live transcript", with reporter corrections before close and errata after. */
export function TranscriptPanel({ session }: { session: SessionDetailDto }) {
  const { t } = useTranslation()
  const fmt = useFormat()
  const lines = useTranscript(session.id)
  const record = useRecord(session.id)
  const [editing, setEditing] = useState<string>()

  const closed = session.recordState === 'closed'
  const canWrite = WRITERS.includes(session.mySessionRole) && !closed
  const errataOpen = closed && !!record.data?.seal?.errataWindowOpen && ERRATA_FILERS.includes(session.mySessionRole)

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{t('proceeding.transcript.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {lines.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : lines.isError ? (
          <BlockedState reason={describeError(lines.error)} />
        ) : lines.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('proceeding.transcript.empty')}</p>
        ) : (
          <ol className="max-h-96 space-y-3 overflow-y-auto pr-2">
            {lines.data.map((l) => (
              <li key={l.id} className="grid grid-cols-[2.5rem_1fr] gap-2 text-sm">
                <span className="pt-0.5 text-right font-mono text-xs text-muted-foreground tabular-nums">{l.seq}</span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium uppercase tracking-wide">{t(`proceeding.transcript.kinds.${l.kind}`)}</span>
                    {l.speakerName && <> · {l.speakerName}</>} · <time dateTime={l.at}>{fmt.time(l.at)}</time>
                  </p>
                  <p className="whitespace-pre-wrap">{l.text}</p>
                  {editing === l.id ? (
                    <LineEditor line={l} mode={canWrite ? 'correct' : 'erratum'} sessionId={session.id} onDone={() => setEditing(undefined)} />
                  ) : (
                    (canWrite || errataOpen) && (
                      <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setEditing(l.id)}>
                        {canWrite ? t('proceeding.transcript.correct') : t('proceeding.transcript.proposeCorrection')}
                      </Button>
                    )
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {canWrite && <AddLineForm session={session} />}
      </CardContent>
    </Card>
  )
}
