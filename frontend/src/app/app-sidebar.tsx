import { LockIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink, useLocation } from 'react-router'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { useCurrentUser } from './context'
import { SCREEN_META, type ScreenKey } from './screens'

export function AppSidebar() {
  const me = useCurrentUser()
  const { t } = useTranslation()
  const { pathname } = useLocation()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className="grid size-7 place-items-center rounded-md bg-primary font-serif text-base text-primary-foreground">
            A
          </span>
          <span className="font-semibold group-data-[collapsible=icon]:hidden">{t('common.appName')}</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t('nav.screens')}</SidebarGroupLabel>
          <SidebarMenu>
            {me.screens.map(({ screen, allowed }) => {
              const key = screen as ScreenKey
              const Icon = SCREEN_META[key].icon
              const label = t(`screens.${key}.label`)
              const reason = t(`screens.${key}.blockedReason`)
              return (
                <SidebarMenuItem key={key}>
                  {/* Blocked screens stay listed with the reason (spec 1.1). */}
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === `/${key}`}
                    tooltip={allowed ? label : `${label}: ${reason}`}
                    className={allowed ? undefined : 'text-muted-foreground'}
                  >
                    <NavLink to={`/${key}`} aria-description={allowed ? undefined : `${t('nav.blockedPrefix')} ${reason}`}>
                      <Icon />
                      <span>{label}</span>
                      {!allowed && <LockIcon className="ml-auto size-3.5" aria-hidden />}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 py-1.5 text-sm group-data-[collapsible=icon]:hidden">
          <p className="truncate font-medium">{me.name}</p>
          <p className="text-xs text-muted-foreground">
            {t(`roles.${me.role}`)} · {t(`sides.${me.side}`)}
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
