import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { intlLocale } from '.'

/** Date and time formatters for the current language. */
export function useFormat() {
  const { i18n } = useTranslation()
  const locale = intlLocale(i18n.resolvedLanguage)
  return useMemo(() => {
    const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
    const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' })
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    const time = new Intl.DateTimeFormat(locale, { timeStyle: 'short' })
    const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 })
    const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
    return {
      dateTime: (iso: string) => dateTime.format(new Date(iso)),
      date: (iso: string) => date.format(new Date(iso)),
      /** For YYYY-MM-DD day keys, which are UTC dates. */
      weekday: (day: string) => weekday.format(new Date(`${day}T00:00:00Z`)),
      time: (iso: string) => time.format(new Date(iso)),
      percent: (n: number) => percent.format(n),
      decimal: (n: number) => decimal.format(n),
    }
  }, [locale])
}
