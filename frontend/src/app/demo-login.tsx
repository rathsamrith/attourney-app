import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { describeError } from '@/api/client'
import { authAdminLogin, authRequestOtp, authVerifyOtp, type DemoUserDto } from '@/api/generated'
import { LanguageSwitcher } from '@/components/attest/language-switcher'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

/**
 * One-time-code sign-in: request an emailed code, then verify it. Optionally lists the
 * seeded test accounts as role → credentials so a demo can start in one click.
 */
export function DemoLogin({
  demoUsers,
  showCredentials,
  onToken,
}: {
  demoUsers: DemoUserDto[]
  showCredentials: boolean
  onToken: (token: string) => void
}) {
  const { t } = useTranslation()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [adminMode, setAdminMode] = useState(false)
  const [password, setPassword] = useState('')
  const twoCol = showCredentials && demoUsers.length > 0 && !adminMode

  const adminSignIn = async () => {
    setError(undefined)
    setBusy(true)
    try {
      const res = await authAdminLogin({ body: { email, password } })
      if (res.data?.token) onToken(res.data.token)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  const send = async (to: string) => {
    setError(undefined)
    setBusy(true)
    try {
      await authRequestOtp({ body: { email: to } })
      setEmail(to)
      setStep('code')
      setCode('')
      toast.success(t('auth.codeSentToast'))
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    setError(undefined)
    setBusy(true)
    try {
      const res = await authVerifyOtp({ body: { email, code } })
      if (res.data?.token) onToken(res.data.token)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  if (adminMode) {
    return (
      <main className="grid min-h-svh place-items-center bg-muted/40 p-4">
        <div className="absolute top-3 right-3">
          <LanguageSwitcher />
        </div>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{t('common.appName')}</p>
            <CardTitle className="text-xl">{t('auth.adminTitle')}</CardTitle>
            <CardDescription>{t('auth.adminDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="email"
              autoComplete="username"
              placeholder="admin@attest.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && email && password && void adminSignIn()}
            />
            <Button className="w-full" disabled={busy || !email || !password} onClick={() => void adminSignIn()}>
              {t('auth.signIn')}
            </Button>
            <Button
              variant="link"
              size="sm"
              className="px-0"
              onClick={() => {
                setAdminMode(false)
                setError(undefined)
              }}
            >
              {t('auth.backToCode')}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="grid min-h-svh place-items-center bg-muted/40 p-4">
      <div className="absolute top-3 right-3">
        <LanguageSwitcher />
      </div>
      <div className={twoCol ? 'grid w-full max-w-4xl gap-6 md:grid-cols-2' : 'grid w-full max-w-sm gap-6'}>
        <Card>
          <CardHeader>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{t('common.appName')}</p>
            <CardTitle className="text-xl">{step === 'email' ? t('auth.otpTitle') : t('auth.codeTitle')}</CardTitle>
            <CardDescription>
              {step === 'email' ? t('auth.otpDescription') : t('auth.codeSentTo', { email })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {step === 'email' ? (
              <>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="name@attest.local"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && email && void send(email)}
                />
                <Button className="w-full" disabled={busy || !email} onClick={() => void send(email)}>
                  {t('auth.sendCode')}
                </Button>
                <div className="text-center">
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => {
                      setAdminMode(true)
                      setError(undefined)
                    }}
                  >
                    {t('auth.adminSignIn')}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">{t('auth.mailhogHint')}</p>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && void verify()}
                />
                <Button className="w-full" disabled={busy || code.length !== 6} onClick={() => void verify()}>
                  {t('auth.verify')}
                </Button>
                <div className="flex justify-between">
                  <Button variant="link" size="sm" className="px-0" onClick={() => setStep('email')}>
                    {t('auth.useAnotherEmail')}
                  </Button>
                  <Button variant="link" size="sm" className="px-0" disabled={busy} onClick={() => void send(email)}>
                    {t('auth.resend')}
                  </Button>
                </div>
              </>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>

        {twoCol && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('auth.credsTitle')}</CardTitle>
            <CardDescription>{t('auth.credsHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {demoUsers.map((u) => (
              <button
                key={u.email}
                type="button"
                disabled={busy}
                onClick={() => void send(u.email)}
                className="flex w-full items-center justify-between gap-3 rounded-md border p-2 text-left hover:bg-accent disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{u.name}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">{u.email}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">{t(`roles.${u.role}`)}</Badge>
                  <span className="text-xs text-primary">{t('auth.use')}</span>
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
        )}
      </div>
    </main>
  )
}
