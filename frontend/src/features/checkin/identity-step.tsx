import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { describeError } from '@/api/client'
import type { CheckinStatusDto } from '@/api/generated'
import { useVerifyIdentity } from '@/api/queries'
import { BlockedState } from '@/components/attest/blocked-state'
import { Field, Segmented } from '@/components/attest/form'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type Method = 'biometric' | 'certificate'

/** Story "Identity verification" (R1): face match or digital certificate, at most three automated attempts. */
export function IdentityStep({ sessionId, status }: { sessionId: string; status: CheckinStatusDto }) {
  const { t } = useTranslation()
  const verify = useVerifyIdentity(sessionId)
  const [method, setMethod] = useState<Method>('biometric')
  const [simulateFail, setSimulateFail] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream>()
  const [certificate, setCertificate] = useState<string>()

  const attemptsLeft = status.maxAttempts - status.attemptsUsed
  const exhausted = attemptsLeft <= 0

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream
    return () => stream?.getTracks().forEach((tr) => tr.stop())
  }, [stream])

  const startCamera = async () => {
    try {
      setStream(await navigator.mediaDevices.getUserMedia({ video: true }))
    } catch {
      /* The device check already reported camera access; the verify button stays disabled. */
    }
  }

  const captureAndVerify = () => {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    // The development face-match fake fails any evidence containing "fail".
    const evidence = simulateFail ? 'fail' : canvas.toDataURL('image/jpeg', 0.8)
    verify.mutate({ method: 'biometric', evidence })
  }

  if (exhausted) {
    return <BlockedState title={t('checkin.identity.failedTitle')} reason={t('checkin.identity.exhaustedBody')} />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('checkin.identity.title')}</CardTitle>
        <CardDescription>{t('checkin.identity.attemptsLeft', { count: attemptsLeft })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Segmented
          label={t('checkin.identity.title')}
          value={method}
          onChange={setMethod}
          options={[
            { value: 'biometric', label: t('checkin.identity.face') },
            { value: 'certificate', label: t('checkin.identity.certificate') },
          ]}
        />

        {status.verification === 'failed' && !verify.isPending && (
          <Alert variant="destructive">
            <AlertTitle>{t('checkin.identity.failedTitle')}</AlertTitle>
            <AlertDescription>{t('checkin.identity.failedBody')}</AlertDescription>
          </Alert>
        )}
        {verify.isError && <BlockedState reason={describeError(verify.error)} />}

        {method === 'biometric' ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('checkin.identity.faceHelp')}</p>
            <div className="aspect-video w-full max-w-md overflow-hidden rounded-lg bg-muted">
              <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
            </div>
            <div className="flex flex-wrap gap-2">
              {!stream && (
                <Button variant="outline" onClick={() => void startCamera()}>
                  {t('checkin.identity.startCamera')}
                </Button>
              )}
              <Button disabled={!stream || verify.isPending} onClick={captureAndVerify}>
                {t('checkin.identity.captureAndVerify')}
              </Button>
            </div>
            {import.meta.env.DEV && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={simulateFail} onChange={(e) => setSimulateFail(e.target.checked)} />
                {t('checkin.identity.simulateFail')}
              </label>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('checkin.identity.certificateHelp')}</p>
            <Field label={t('checkin.identity.chooseCertificate')} htmlFor="certificate-file">
              <Input
                id="certificate-file"
                type="file"
                accept=".pem,.crt,.cer"
                onChange={async (e) => setCertificate(await e.target.files?.[0]?.text())}
              />
            </Field>
            <Button
              disabled={!certificate || verify.isPending}
              onClick={() => certificate && verify.mutate({ method: 'certificate', evidence: certificate })}
            >
              {t('checkin.identity.verify')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
