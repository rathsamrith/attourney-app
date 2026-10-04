import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import { en } from './locales/en'
import { km } from './locales/km'

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'km', label: 'ខ្មែរ' },
] as const
export type LanguageCode = (typeof LANGUAGES)[number]['code']

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, km: { translation: km } },
    supportedLngs: LANGUAGES.map((l) => l.code),
    fallbackLng: 'en',
    // Remember the choice per browser; first visit follows the browser language.
    detection: { order: ['localStorage', 'navigator'], lookupLocalStorage: 'attest.lang', caches: ['localStorage'] },
    interpolation: { escapeValue: false },
  })

// Keeps <html lang> right for screen readers, fonts and the Khmer line-height rules in index.css.
const syncLang = (lng: string) => {
  document.documentElement.lang = lng
}
syncLang(i18n.resolvedLanguage ?? 'en')
i18n.on('languageChanged', syncLang)

/** BCP 47 tag for Intl date and number formatting. */
export function intlLocale(lng: string | undefined) {
  return lng === 'km' ? 'km-KH' : 'en-GB'
}

export default i18n
