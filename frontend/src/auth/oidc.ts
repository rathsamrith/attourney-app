import { InMemoryWebStorage, WebStorageStateStore, type UserManagerSettings } from 'oidc-client-ts'

/**
 * Authorization code flow with PKCE against the Attest realm.
 * Tokens live in memory only, so an injected script can't read them from storage.
 * A page reload signs in again silently through the identity provider's session.
 */
export const oidcConfig: UserManagerSettings = {
  authority: import.meta.env.VITE_OIDC_AUTHORITY,
  client_id: import.meta.env.VITE_OIDC_CLIENT_ID,
  redirect_uri: `${window.location.origin}/`,
  post_logout_redirect_uri: `${window.location.origin}/`,
  scope: 'openid profile email',
  automaticSilentRenew: true,
  userStore: new WebStorageStateStore({ store: new InMemoryWebStorage() }),
}

/** Removes ?code=&state= from the address bar after the redirect back from sign-in. */
export function onSigninCallback() {
  window.history.replaceState({}, document.title, window.location.pathname)
}
