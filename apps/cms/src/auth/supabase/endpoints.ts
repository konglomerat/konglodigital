import type { Endpoint, Payload } from 'payload'

import {
  cookie,
  exchangeCode,
  getSSOConfig,
  type Identity,
  makeAuthorization,
  readCookie,
  seal,
  SSOError,
  type Transaction,
  unseal,
  verifyBackendIdentity,
} from './core.js'

export const ensurePayloadUser = async (payload: Payload, identity: Identity) => {
  const existing = await payload.find({
    collection: 'users',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { supabaseId: { equals: identity.subject } },
  })
  if (existing.docs[0]) return existing.docs[0]

  const emailMatch = await payload.find({
    collection: 'users',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: { email: { equals: identity.email } },
  })
  // Existing accounts must be linked explicitly by an operator, never by email alone.
  if (emailMatch.docs[0]) throw new SSOError('account_conflict')
  try {
    return await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: { email: identity.email, name: identity.name, supabaseId: identity.subject },
    })
  } catch (error) {
    // Two tabs may complete authorization simultaneously; the unique identity wins.
    const concurrent = await payload.find({
      collection: 'users',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: { supabaseId: { equals: identity.subject } },
    })
    if (concurrent.docs[0]) return concurrent.docs[0]
    throw error
  }
}

const redirect = (location: string, cookies: string[] = []) => {
  const headers = new Headers({
    Location: location,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  })
  for (const value of cookies) headers.append('Set-Cookie', value)
  return new Response(null, { status: 303, headers })
}

export const supabaseEndpoints: Endpoint[] = [
  {
    path: '/sso/login',
    method: 'get',
    handler: async (req) => {
      try {
        const config = getSSOConfig()
        const callbackUrl = `${config.cmsOrigin}${req.payload.config.routes.api}/sso/callback`
        const { transaction, url } = makeAuthorization(config, callbackUrl)
        return redirect(url.toString(), [
          cookie(
            `${req.payload.config.cookiePrefix}-sso-state`,
            seal(transaction, req.payload.secret, 'transaction'),
            transaction.expiresAt,
            config.cmsOrigin.startsWith('https:'),
          ),
        ])
      } catch {
        return redirect(`${req.payload.config.routes.admin}/login?sso_error=configuration`)
      }
    },
  },
  {
    path: '/sso/callback',
    method: 'get',
    handler: async (req) => {
      const stateCookieName = `${req.payload.config.cookiePrefix}-sso-state`
      const clearState = cookie(
        stateCookieName,
        '',
        0,
        process.env.NEXT_PUBLIC_SERVER_URL?.startsWith('https:') ?? false,
      )
      try {
        const config = getSSOConfig()
        const params = new URL(req.url!).searchParams
        const transaction = unseal<Transaction>(
          readCookie(req.headers, stateCookieName),
          req.payload.secret,
          'transaction',
        )
        if (
          !transaction ||
          !transaction.state ||
          !transaction.verifier ||
          params.get('state') !== transaction.state
        ) {
          throw new SSOError('state')
        }
        if (params.has('error')) throw new SSOError('denied')
        const code = params.get('code')
        if (!code) throw new SSOError('state')
        const tokens = await exchangeCode(
          config,
          code,
          transaction.verifier,
          `${config.cmsOrigin}${req.payload.config.routes.api}/sso/callback`,
        )
        const identity = await verifyBackendIdentity(config, tokens.accessToken)
        const session = seal(
          { ...tokens, subject: identity.subject },
          req.payload.secret,
          'session',
        )
        if (session.length > 3800) throw new SSOError('provider')
        await ensurePayloadUser(req.payload, identity)
        return redirect(`${config.cmsOrigin}${req.payload.config.routes.admin}`, [
          clearState,
          cookie(
            `${req.payload.config.cookiePrefix}-token`,
            session,
            tokens.expiresAt,
            config.cmsOrigin.startsWith('https:'),
          ),
        ])
      } catch (error) {
        const code = error instanceof SSOError ? error.code : 'provider'
        // Never log authorization codes, access tokens or provider response bodies.
        req.payload.logger.warn(`Supabase SSO callback rejected: ${code}`)
        return redirect(`${req.payload.config.routes.admin}/login?sso_error=${code}`, [clearState])
      }
    },
  },
]
