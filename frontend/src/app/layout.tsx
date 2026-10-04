import { LogOutIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router'
import { useAuth } from 'react-oidc-context'
import { authSignedOut } from '@/api/generated'
import { useSessionEvents } from '@/api/realtime'
import { LanguageSwitcher } from '@/components/attest/language-switcher'
import { NotificationsMenu } from '@/components/attest/notifications-menu'
import { RecordIndicator } from '@/components/attest/record-indicator'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from './app-sidebar'
import { useCurrentSession } from './context'

export function AppLayout() {
  const auth = useAuth()
  const { t } = useTranslation()
  const { current } = useCurrentSession()
  useSessionEvents(current?.id)

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex min-h-14 items-center gap-3 border-b bg-background px-4 py-2">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-5" />
          {current ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{current.caption}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {t('common.docketLine', { docketNo: current.docketNo, day: current.dayNo })}
              </p>
            </div>
          ) : (
            <p className="flex-1 text-sm text-muted-foreground">{t('common.noSessionAssigned')}</p>
          )}
          {current && <RecordIndicator state={current.recordState} />}
          {current && <NotificationsMenu sessionId={current.id} />}
          <LanguageSwitcher />
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('common.signOut')}
            onClick={async () => {
              // Story "Sign in": sign-out appears in the audit trail.
              await authSignedOut().catch(() => undefined)
              await auth.signoutRedirect()
            }}
          >
            <LogOutIcon />
          </Button>
        </header>
        <main className="mx-auto w-full max-w-6xl p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6 space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
      {description && <p className="max-w-prose text-muted-foreground">{description}</p>}
    </div>
  )
}
