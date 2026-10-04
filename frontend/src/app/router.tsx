import { useTranslation } from 'react-i18next'
import { Navigate, Route, Routes, useParams } from 'react-router'
import { BlockedState } from '@/components/attest/blocked-state'
import { AuditPage } from '@/features/audit/audit-page'
import { CaucusPage } from '@/features/caucus/caucus-page'
import { CheckinPage } from '@/features/checkin/checkin-page'
import { DeliberationPage } from '@/features/deliberation/deliberation-page'
import { DocketPage } from '@/features/docket/docket-page'
import { ExhibitsPage } from '@/features/exhibits/exhibits-page'
import { HearingPage } from '@/features/hearing/hearing-page'
import { SealingPage } from '@/features/sealing/sealing-page'
import { CurrentSessionProvider, useCurrentUser } from './context'
import { AppLayout, PageHeader } from './layout'
import type { ScreenKey } from './screens'

const PAGES: Record<ScreenKey, React.ComponentType> = {
  checkin: CheckinPage,
  hearing: HearingPage,
  exhibits: ExhibitsPage,
  caucus: CaucusPage,
  deliberation: DeliberationPage,
  sealing: SealingPage,
  docket: DocketPage,
  audit: AuditPage,
}

function ScreenRoute() {
  const { screen } = useParams()
  const me = useCurrentUser()
  const { t } = useTranslation()
  const access = me.screens.find((s) => s.screen === screen)
  if (!access) return <Navigate to="/hearing" replace />

  const key = access.screen as ScreenKey
  if (!access.allowed) {
    return (
      <>
        <PageHeader title={t(`screens.${key}.label`)} />
        <BlockedState reason={t(`screens.${key}.blockedReason`)} />
      </>
    )
  }
  const Page = PAGES[key]
  return <Page />
}

export function AppRoutes() {
  return (
    <CurrentSessionProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/hearing" replace />} />
          <Route path=":screen" element={<ScreenRoute />} />
          <Route path="*" element={<Navigate to="/hearing" replace />} />
        </Route>
      </Routes>
    </CurrentSessionProvider>
  )
}
