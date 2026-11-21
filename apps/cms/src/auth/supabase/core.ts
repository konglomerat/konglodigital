import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

export const ssoEnabled = () => process.env.SUPABASE_SSO_ENABLED === 'true'

export class SSOError extends Error {
  constructor(public code: string) {
    super(code)
  }
}

const required = (name: string) => {
  const value = process.env[name]?.trim()
  if (!value) throw new SSOError('configuration')
  return value
}

const origin = (value: string) => {
  const url = new URL(value)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new SSOError('configuration')
  return url.origin
}

export const getSSOConfig = () => {
  if (!ssoEnabled()) throw new SSOError('configuration')
  return {
    cmsOrigin: origin(required('NEXT_PUBLIC_SERVER_URL')),
    supabaseOrigin: origin(required('SUPABASE_URL')),
    anonKey: required('SUPABASE_ANON_KEY'),
    clientId: required('SUPABASE_OAUTH_CLIENT_ID'),
    clientSecret: required('SUPABASE_OAUTH_CLIENT_SECRET'),
  }
}

export type SSOConfig = ReturnType<typeof getSSOConfig>
export type Session = { accessToken: string; subject: string; expiresAt: number }
export type Transaction = { state: string; verifier: string; expiresAt: number }
export type Identity = { subject: string; email: string; name?: string }

// Authenticate and encrypt cookies with separate keys for login state and sessions.
// Neither OAuth tokens nor the PKCE verifier are exposed to browser JavaScript.
export const seal = (value: Session | Transaction, secret: string, purpose: string) => {
  const key = createHash('sha256').update(`${secret}:${purpose}`).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
}

export const unseal = <T extends { expiresAt: number }>(
  value: string | undefined,
  secret: string,
  purpose: string,
): T | null => {
  if (!value || value.length > 3800) return null
  try {
    const bytes = Buffer.from(value, 'base64url')
    const key = createHash('sha256').update(`${secret}:${purpose}`).digest()
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
    decipher.setAuthTag(bytes.subarray(12, 28))
    const parsed = JSON.parse(
      Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'),
    ) as T
    return Number.isFinite(parsed.expiresAt) && parsed.expiresAt > Date.now() / 1000 ? parsed : null
  } catch {
    return null
  }
}

export const readCookie = (headers: Headers, name: string) =>
  headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)

export const cookie = (name: string, value: string, expiresAt: number, secure: boolean) =>
  `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt * 1000).toUTCString()}${secure ? '; Secure' : ''}`

export const makeAuthorization = (config: SSOConfig, callbackUrl: string) => {
  const transaction: Transaction = {
    state: randomBytes(32).toString('base64url'),
    verifier: randomBytes(32).toString('base64url'),
    expiresAt: Math.floor(Date.now() / 1000) + 600,
  }
  const url = new URL('/auth/v1/oauth/authorize', config.supabaseOrigin)
  url.search = new URLSearchParams({
    // The self-hosted Kong gateway requires the public anon key on browser redirects.
    apikey: config.anonKey,
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: callbackUrl,
    scope: 'email profile',
    state: transaction.state,
    code_challenge: createHash('sha256').update(transaction.verifier).digest('base64url'),
    code_challenge_method: 'S256',
  }).toString()
  return { transaction, url }
}

const fetchJSON = async (url: URL, init: RequestInit = {}) => {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new SSOError('provider')
  return response.json()
}

export const exchangeCode = async (
  config: SSOConfig,
  code: string,
  verifier: string,
  callbackUrl: string,
) => {
  const tokens = await fetchJSON(new URL('/auth/v1/oauth/token', config.supabaseOrigin), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      apikey: config.anonKey,
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: callbackUrl,
    }),
  })
  if (
    typeof tokens.access_token !== 'string' ||
    !tokens.access_token ||
    typeof tokens.expires_in !== 'number' ||
    !Number.isFinite(tokens.expires_in) ||
    tokens.expires_in <= 0 ||
    tokens.token_type?.toLowerCase() !== 'bearer'
  )
    throw new SSOError('provider')
  return {
    accessToken: tokens.access_token as string,
    expiresAt: Math.floor(Date.now() / 1000) + Math.min(tokens.expires_in, 3600),
  }
}

export const verifyBackendIdentity = async (
  config: SSOConfig,
  accessToken: string,
): Promise<Identity> => {
  const headers = { Authorization: `Bearer ${accessToken}`, apikey: config.anonKey }
  // The provider validates the token; never trust decoded JWT claims or user_metadata.
  const info = await fetchJSON(new URL('/auth/v1/oauth/userinfo', config.supabaseOrigin), {
    headers,
  })
  if (
    typeof info.sub !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(info.sub) ||
    typeof info.email !== 'string' ||
    !info.email ||
    info.email_verified !== true
  )
    throw new SSOError('identity')

  // Query current roles on every authenticated request so removal takes effect immediately.
  // This uses the user's token and RLS, never a Supabase service-role key.
  const url = new URL('/rest/v1/role_assignments', config.supabaseOrigin)
  url.search = new URLSearchParams({
    select: 'role,scope_id',
    user_id: `eq.${info.sub}`,
    scope_id: 'is.null',
    role: 'in.(admin,backend)',
  }).toString()
  const access = await fetchJSON(url, { headers })
  if (
    !Array.isArray(access) ||
    !access.some((assignment) =>
      assignment?.scope_id === null && ['admin', 'backend'].includes(assignment.role),
    )
  ) {
    throw new SSOError('forbidden')
  }
  return {
    subject: info.sub,
    email: info.email.toLowerCase(),
    name: typeof info.name === 'string' ? info.name : undefined,
  }
}

/** Frontend sessions use Supabase's normal user endpoint, with the same CMS roles. */
export const verifyFrontendEditorIdentity = async (config: SSOConfig, accessToken: string): Promise<Identity> => {
  const headers = { Authorization: `Bearer ${accessToken}`, apikey: config.anonKey }
  const user = await fetchJSON(new URL('/auth/v1/user', config.supabaseOrigin), { headers })
  if (typeof user.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(user.id) || typeof user.email !== 'string' || !user.email_confirmed_at) throw new SSOError('identity')
  const url = new URL('/rest/v1/role_assignments', config.supabaseOrigin)
  url.search = new URLSearchParams({ select: 'role,scope_id', user_id: `eq.${user.id}`, scope_id: 'is.null', role: 'in.(admin,backend)' }).toString()
  const roles = await fetchJSON(url, { headers })
  if (!Array.isArray(roles) || !roles.some(role => role.scope_id === null && ['admin', 'backend'].includes(role.role))) throw new SSOError('forbidden')
  return { subject: user.id, email: user.email.toLowerCase() }
}
