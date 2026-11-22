import type { AuthStrategy, CollectionConfig } from 'payload'

import { getSSOConfig, readCookie, type Session, unseal, verifyBackendIdentity } from './core.js'

type Hooks = NonNullable<CollectionConfig['hooks']>
type MeHook = NonNullable<Hooks['me']>[number]
type RefreshHook = NonNullable<Hooks['refresh']>[number]

export const supabaseStrategy: AuthStrategy = {
  name: 'supabase-oauth',
  authenticate: async ({ headers, payload }) => {
    try {
      const config = getSSOConfig()
      const origin = headers.get('origin')
      if (
        (origin && origin !== config.cmsOrigin) ||
        headers.get('sec-fetch-site') === 'cross-site'
      ) {
        return { user: null }
      }
      const session = unseal<Session>(
        readCookie(headers, `${payload.config.cookiePrefix}-token`),
        payload.secret,
        'session',
      )
      if (!session?.accessToken || !session.subject) return { user: null }
      const identity = await verifyBackendIdentity(config, session.accessToken)
      if (identity.subject !== session.subject) return { user: null }
      const result = await payload.find({
        collection: 'users',
        where: { supabaseId: { equals: identity.subject } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      const user = result.docs[0]
      return { user: user ? { ...user, collection: 'users', _strategy: 'supabase-oauth' } : null }
    } catch {
      // Invalid/expired tokens, revoked roles and provider failures all fail closed.
      return { user: null }
    }
  },
}

// Payload normally decodes its cookie as a JWT. Ours is encrypted and must never
// be returned by /me or replaced by an unrestricted Payload JWT during refresh.
export const supabaseMe: MeHook = ({ args, user }) => {
  const session = unseal<Session>(
    readCookie(args.req.headers, `${args.req.payload.config.cookiePrefix}-token`),
    args.req.payload.secret,
    'session',
  )
  return { user, exp: session?.expiresAt ?? 0 }
}

export const supabaseRefresh: RefreshHook = ({ args, user }) => {
  const session = unseal<Session>(
    readCookie(args.req.headers, `${args.req.payload.config.cookiePrefix}-token`),
    args.req.payload.secret,
    'session',
  )
  return { user, exp: session?.expiresAt ?? 0, refreshedToken: '', setCookie: false }
}
