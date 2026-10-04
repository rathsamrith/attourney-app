import {
  CalendarDaysIcon,
  FileStackIcon,
  GavelIcon,
  ScanFaceIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  UsersRoundIcon,
  VoteIcon,
  type LucideIcon,
} from 'lucide-react'
import type { en } from '@/i18n/locales/en'

/** Screen keys come from the API (GET /api/me); this adds what the UI needs to show them. */
export type ScreenKey = keyof typeof en.screens

export const SCREEN_META: Record<ScreenKey, { icon: LucideIcon }> = {
  checkin: { icon: ScanFaceIcon },
  hearing: { icon: GavelIcon },
  exhibits: { icon: FileStackIcon },
  caucus: { icon: UsersRoundIcon },
  deliberation: { icon: VoteIcon },
  sealing: { icon: ShieldCheckIcon },
  docket: { icon: CalendarDaysIcon },
  audit: { icon: ScrollTextIcon },
}
