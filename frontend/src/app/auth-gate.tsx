import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from 'react-oidc-context'
import { useTranslation } from 'react-i18next'
import { describeError, setAccessToken } from '@/api/client'
import { authSignedIn } from '@/api/generated'
import { useAuthConfig, useMe } from '@/api/queries'
import { LanguageSwitcher } from '@/components/attest/language-switcher'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { MeProvider } from './context'
import { DemoLogin } from './demo-login'

const DEMO_TOKEN_KEY = 'attest.demoToken'

function readDemoToken(): string | undefined {
  try {
    return localStorage.getItem(DEMO_TOKEN_KEY) ?? undefined
  } catch {
    return undefined
  }
}

function CenteredCard({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <main className="grid min-h-svh place-items-center bg-muted/40 p-4">
      <div className="absolute top-3 right-3">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{t('common.appName')}</p>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {action && <CardFooter>{action}</CardFooter>}
      </Card>
    </main>
  )
}

/** Picks the sign-in flow: emailed one-time code (demo) or the OIDC provider (default). */
export function AuthGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const config = useAuthConfig()

  if (config.isPending) {
    return <CenteredCard title={t('auth.signingInTitle')} description={t('auth.signingInDescription')} />
  }
  return config.data?.otp === true ? <OtpGate>{children}</OtpGate> : <OidcGate>{children}</OidcGate>
}

/** OTP flow: hold the app token from the one-time-code sign-in, then load the account. */
function OtpGate({ children }: { children: ReactNode }) {
  const config = useAuthConfig()
  const [token, setToken] = useState<string | undefined>(() => readDemoToken())
  setAccessToken(token)

  if (!token) {
    return (
      <DemoLogin
        demoUsers={config.data?.demoUsers ?? []}
        showCredentials={config.data?.showCredentials ?? false}
        onToken={(tk) => {
          try {
            localStorage.setItem(DEMO_TOKEN_KEY, tk)
          } catch {
            /* storage unavailable: keep it in memory only */
          }
          setAccessToken(tk)
          setToken(tk)
        }}
      />
    )
  }

  const signOut = () => {
    try {
      localStorage.removeItem(DEMO_TOKEN_KEY)
    } catch {
      /* ignore */
    }
    setAccessToken(undefined)
    setToken(undefined)
  }
  return (
    <LoadedAccount sessionKey={`demo:${token.slice(-16)}`} onSignOut={signOut}>
      {children}
    </LoadedAccount>
  )
}

/** Default flow: sign in with the OIDC provider, then load the account. */
function OidcGate({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const { t } = useTranslation()
  // Keep the API client's token in step with the OIDC session before any query runs.
  setAccessToken(auth.user?.access_token)

  if (auth.isLoading) {
    return <CenteredCard title={t('auth.signingInTitle')} description={t('auth.signingInDescription')} />
  }
  if (auth.error) {
    return (
      <CenteredCard
        title={t('auth.failedTitle')}
        description={auth.error.message}
        action={<Button onClick={() => void auth.signinRedirect()}>{t('common.tryAgain')}</Button>}
      />
    )
  }
  if (!auth.isAuthenticated) {
    return (
      <CenteredCard
        title={t('auth.signInTitle')}
        description={t('auth.signInDescription')}
        action={
          <Button className="w-full" onClick={() => void auth.signinRedirect()}>
            {t('common.signIn')}
          </Button>
        }
      />
    )
  }
  return (
    <LoadedAccount
      sessionKey={auth.user?.session_state ?? auth.user?.profile.sid}
      onSignOut={() => void auth.signoutRedirect()}
    >
      {children}
    </LoadedAccount>
  )
}

/** Reports each sign-in to the audit trail once per session. */
function useReportSignIn(ready: boolean, sessionKey: string | undefined) {
  useEffect(() => {
    if (!ready || !sessionKey) return
    const flag = `attest.signedIn.${sessionKey}`
    try {
      if (sessionStorage.getItem(flag)) return
      sessionStorage.setItem(flag, '1')
    } catch {
      /* storage unavailable: report anyway */
    }
    void authSignedIn().catch(() => undefined)
  }, [ready, sessionKey])
}

/** Loads the Attest account for whichever sign-in flow produced the token. */
function LoadedAccount({
  sessionKey,
  onSignOut,
  children,
}: {
  sessionKey: string | undefined
  onSignOut: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  const me = useMe()
  useReportSignIn(me.isSuccess, sessionKey)

  if (me.isPending) {
    return (
      <main className="grid min-h-svh place-items-center p-4">
        <CardContent className="w-full max-w-sm space-y-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </main>
    )
  }
  if (me.isError) {
    return (
      <CenteredCard
        title={t('auth.noAccessTitle')}
        description={describeError(me.error)}
        action={
          <Button variant="outline" onClick={onSignOut}>
            {t('common.signOut')}
          </Button>
        }
      />
    )
  }
  return <MeProvider me={me.data}>{children}</MeProvider>
}
