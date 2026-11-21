import { LogOutIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { setAccessToken } from '@/api/client'
import { authSignedOut } from '@/api/generated'
import { LanguageSwitcher } from '@/components/attest/language-switcher'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AdminPage } from '@/features/admin/admin-page'
import { DEMO_TOKEN_KEY } from './auth-gate'
import { useCurrentUser } from './context'

/** A dedicated, hearing-free shell for administrators: just the admin dashboard. */
export function AdminShell() {
  const { t } = useTranslation()
  const me = useCurrentUser()

  const signOut = async () => {
    await authSignedOut().catch(() => undefined)
    try {
      localStorage.removeItem(DEMO_TOKEN_KEY)
    } catch {
      /* ignore */
    }
    setAccessToken(undefined)
    window.location.assign('/')
  }

  return (
    <div className="min-h-svh bg-muted/20">
      <header className="sticky top-0 z-10 flex min-h-14 items-center gap-3 border-b bg-background px-4 py-2">
        <span className="grid size-7 place-items-center rounded-md bg-primary font-serif text-base text-primary-foreground">
          A
        </span>
        <span className="font-semibold">{t('common.appName')}</span>
        <Badge variant="secondary">{t('roles.admin')}</Badge>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-sm text-muted-foreground sm:inline">{me.name}</span>
          <LanguageSwitcher />
          <Button variant="ghost" size="icon" aria-label={t('common.signOut')} onClick={signOut}>
            <LogOutIcon />
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl p-4 md:p-6">
        <AdminPage />
      </main>
    </div>
  )
}
