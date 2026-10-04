import i18n from '@/i18n'
import { client } from './generated/client.gen'

let accessToken: string | undefined

/** Called by the auth layer whenever the token changes. */
export function setAccessToken(token: string | undefined) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

// Same origin: Vite proxies /api to Nest in development.
client.setConfig({
  baseUrl: '',
  auth: () => accessToken,
  throwOnError: true,
})

/** Error body shape returned by the API (see backend/src/common/blocked.exception.ts). */
export interface ApiErrorBody {
  statusCode?: number
  error?: string
  message?: string | string[]
  /** Set when a numbered rule (R1 to R8) caused the block. */
  rule?: string
  /** Translation key under "blocked." */
  code?: string
  params?: Record<string, string>
  /** English text from the server, used only when nothing else matches. */
  reason?: string
}

/**
 * The sentence to show the user for a failed request, in the current language.
 * Call it during render (not once in a handler) so it follows language changes.
 */
export function describeError(err: unknown): string {
  const t = i18n.t.bind(i18n)
  const exists = i18n.exists.bind(i18n)
  const body = err as ApiErrorBody | undefined

  if (body?.code && exists(`blocked.${body.code}`)) {
    // Record states inside the sentence get translated too ("already on the record").
    const params = Object.fromEntries(
      Object.entries(body.params ?? {}).map(([k, v]) => [k, exists(`recordInline.${v}`) ? t(`recordInline.${v}`) : v]),
    )
    return t(`blocked.${body.code}`, params)
  }
  if (body?.rule && exists(`rules.${body.rule}`)) return `${t(`rules.${body.rule}`)} (${body.rule})`

  switch (body?.statusCode) {
    case 400:
      return t('errors.validation')
    case 401:
      return t('errors.unauthorized')
    case 403:
      return t('errors.forbidden')
    case 404:
      return t('errors.notFound')
  }
  return body?.reason ?? t('errors.generic')
}

/**
 * Downloads a protected file (exhibit PDF, export bundle) with the access token and
 * returns an object URL. Revoke it with URL.revokeObjectURL when done.
 */
export async function fetchFileUrl(path: string): Promise<string> {
  const res = await fetch(path, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} })
  if (!res.ok) throw await res.json().catch(() => ({ statusCode: res.status }))
  return URL.createObjectURL(await res.blob())
}
