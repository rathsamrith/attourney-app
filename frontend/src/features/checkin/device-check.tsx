import { CheckCircle2Icon, CircleDashedIcon, XCircleIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

type CheckKey = 'camera' | 'microphone' | 'network' | 'secure'
type Result = 'passed' | 'failed' | 'notRun'

async function hasMedia(kind: 'video' | 'audio') {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ [kind]: true })
    stream.getTracks().forEach((t) => t.stop())
    return true
  } catch {
    return false
  }
}

/** Round trip to the API under two seconds counts as a usable connection. */
async function networkOk() {
  const start = performance.now()
  try {
    const res = await fetch('/api/health', { cache: 'no-store' })
    return res.ok && performance.now() - start < 2000
  } catch {
    return false
  }
}

const CHECKS: Record<CheckKey, () => Promise<boolean>> = {
  camera: () => hasMedia('video'),
  microphone: () => hasMedia('audio'),
  network: networkOk,
  secure: async () => window.isSecureContext,
}

/** Story "Device check": each check reports a result; a failure requires a retest. */
export function DeviceCheck({ onPassed }: { onPassed: () => void }) {
  const { t } = useTranslation()
  const [results, setResults] = useState<Record<CheckKey, Result>>({
    camera: 'notRun',
    microphone: 'notRun',
    network: 'notRun',
    secure: 'notRun',
  })
  const [running, setRunning] = useState(false)
  const allPassed = Object.values(results).every((r) => r === 'passed')
  const anyRun = Object.values(results).some((r) => r !== 'notRun')

  const run = async () => {
    setRunning(true)
    for (const key of Object.keys(CHECKS) as CheckKey[]) {
      const ok = await CHECKS[key]()
      setResults((r) => ({ ...r, [key]: ok ? 'passed' : 'failed' }))
    }
    setRunning(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('checkin.device.title')}</CardTitle>
        <CardDescription>{t('checkin.device.help')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-md border">
          {(Object.keys(CHECKS) as CheckKey[]).map((key) => {
            const r = results[key]
            const Icon = r === 'passed' ? CheckCircle2Icon : r === 'failed' ? XCircleIcon : CircleDashedIcon
            return (
              <li key={key} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span>{t(`checkin.device.${key}`)}</span>
                <span
                  className={
                    r === 'passed' ? 'text-status-ok' : r === 'failed' ? 'text-status-failed' : 'text-muted-foreground'
                  }
                >
                  <Icon className="mr-1.5 inline size-4 align-[-2px]" aria-hidden />
                  {t(`checkin.device.${r}`)}
                </span>
              </li>
            )
          })}
        </ul>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button variant={allPassed ? 'outline' : 'default'} disabled={running} onClick={() => void run()}>
          {anyRun ? t('checkin.device.retest') : t('checkin.device.run')}
        </Button>
        <Button disabled={!allPassed} onClick={onPassed}>
          {t('checkin.device.continue')}
        </Button>
      </CardFooter>
    </Card>
  )
}
