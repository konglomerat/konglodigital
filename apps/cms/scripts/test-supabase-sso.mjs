import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { logoutHandler } from '../node_modules/payload/dist/auth/endpoints/logout.js'
import { meOperation } from '../node_modules/payload/dist/auth/operations/me.js'

// Compile the real auth modules without loading Payload's config or connecting to a database.
const temporary = await mkdtemp(path.join(tmpdir(), 'konglo-sso-test-'))
for (const name of ['core', 'strategy', 'endpoints']) {
  const source = await readFile(new URL(`../src/auth/supabase/${name}.ts`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  })
  await writeFile(path.join(temporary, `${name}.js`), outputText)
}
await writeFile(path.join(temporary, 'package.json'), '{"type":"module"}')
const core = await import(pathToFileURL(path.join(temporary, 'core.js')))
const { supabaseStrategy, supabaseMe, supabaseRefresh } = await import(
  pathToFileURL(path.join(temporary, 'strategy.js'))
)
const { supabaseEndpoints, ensurePayloadUser } = await import(
  pathToFileURL(path.join(temporary, 'endpoints.js'))
)
const originalFetch = globalThis.fetch
after(async () => {
  globalThis.fetch = originalFetch
  await rm(temporary, { recursive: true, force: true })
})

Object.assign(process.env, {
  SUPABASE_SSO_ENABLED: 'true',
  NEXT_PUBLIC_SERVER_URL: 'https://cms.example.test',
  SUPABASE_URL: 'https://auth.example.test',
  SUPABASE_ANON_KEY: 'public-test-key',
  SUPABASE_OAUTH_CLIENT_ID: 'client-test',
  SUPABASE_OAUTH_CLIENT_SECRET: 'secret-test',
})
const secret = 'only-a-test-payload-secret'
const subject = '1b2ea7cc-2233-4455-aabb-123456789012'
const identity = { subject, email: 'member@example.test', name: 'Member' }
const expiresAt = Math.floor(Date.now() / 1000) + 600
const session = { subject, accessToken: 'opaque-test-access-token', expiresAt }
const makePayload = () => ({
  secret,
  db: {},
  config: { cookiePrefix: 'payload', routes: { api: '/api', admin: '/admin' } },
  find: async () => ({ docs: [{ id: 42, supabaseId: subject, email: identity.email }] }),
  logger: { warn() {} },
})
const makeHeaders = (value = session) =>
  new Headers({
    cookie: `payload-token=${core.seal(value, secret, 'session')}`,
    origin: 'https://cms.example.test',
  })
const json = (body, status = 200) => Response.json(body, { status })
const mockProvider = ({ roles = ['backend'], scopeId = null, verified = true, fail = false } = {}) => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url: new URL(url), options })
    if (fail) return json({}, 503)
    if (url.pathname === '/auth/v1/oauth/token')
      return json({ access_token: session.accessToken, expires_in: 3600, token_type: 'bearer' })
    if (url.pathname === '/auth/v1/oauth/userinfo')
      return json({ sub: subject, email: identity.email, email_verified: verified, name: 'Member' })
    if (url.pathname === '/auth/v1/user')
      return json({ id: subject, email: identity.email, email_confirmed_at: verified ? '2026-01-01T00:00:00Z' : null })
    if (url.pathname === '/rest/v1/role_assignments')
      return json(roles.map((role) => ({ role, scope_id: scopeId })))
    throw new Error('Unexpected provider endpoint')
  }
  return calls
}
const startLogin = async (payload = makePayload()) => {
  const response = await supabaseEndpoints[0].handler({ payload, headers: new Headers() })
  const location = new URL(response.headers.get('location'))
  const stateCookie = response.headers.getSetCookie()[0].split(';')[0]
  return { response, location, stateCookie }
}

test('authorization uses random state, S256 PKCE and the configured callback', async () => {
  const { response, location, stateCookie } = await startLogin()
  assert.equal(response.status, 303)
  assert.equal(location.origin, 'https://auth.example.test')
  assert.equal(location.searchParams.get('apikey'), 'public-test-key')
  assert.equal(
    location.searchParams.get('redirect_uri'),
    'https://cms.example.test/api/sso/callback',
  )
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256')
  const transaction = core.unseal(stateCookie.split('=')[1], secret, 'transaction')
  assert.equal(location.searchParams.get('state'), transaction.state)
  assert.equal(
    location.searchParams.get('code_challenge'),
    createHash('sha256').update(transaction.verifier).digest('base64url'),
  )
  assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/)
  assert.match(response.headers.get('set-cookie'), /Secure/)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.ok(!location.toString().includes('secret-test'))
})

test('encrypted cookies reject tampering, expiry, a wrong key and the wrong purpose', () => {
  const sealed = core.seal(session, secret, 'session')
  assert.deepEqual(core.unseal(sealed, secret, 'session'), session)
  const bytes = Buffer.from(sealed, 'base64url')
  bytes[30] ^= 1
  assert.equal(core.unseal(bytes.toString('base64url'), secret, 'session'), null)
  assert.equal(core.unseal(sealed, 'wrong-secret', 'session'), null)
  assert.equal(core.unseal(sealed, secret, 'transaction'), null)
  assert.equal(
    core.unseal(core.seal({ ...session, expiresAt: 1 }, secret, 'session'), secret, 'session'),
    null,
  )
  assert.equal(core.unseal('malformed', secret, 'session'), null)
})

test('callback rejects missing/mismatched state before any provider call', async () => {
  const calls = mockProvider()
  const { stateCookie } = await startLogin()
  for (const headers of [new Headers(), new Headers({ cookie: stateCookie })]) {
    const response = await supabaseEndpoints[1].handler({
      payload: makePayload(),
      headers,
      url: 'https://cms.example.test/api/sso/callback?code=test&state=wrong',
    })
    assert.match(response.headers.get('location'), /sso_error=state$/)
    assert.match(response.headers.get('set-cookie'), /1970/)
  }
  assert.equal(calls.length, 0)
})

test('denied consent clears state without a token exchange', async () => {
  const calls = mockProvider()
  const { location, stateCookie } = await startLogin()
  const response = await supabaseEndpoints[1].handler({
    payload: makePayload(),
    headers: new Headers({ cookie: stateCookie }),
    url: `https://cms.example.test/api/sso/callback?error=access_denied&state=${location.searchParams.get('state')}`,
  })
  assert.match(response.headers.get('location'), /sso_error=denied$/)
  assert.equal(calls.length, 0)
})

test('successful callback exchanges code server-side and issues a bounded encrypted CMS cookie', async () => {
  const calls = mockProvider()
  const { location, stateCookie } = await startLogin()
  const response = await supabaseEndpoints[1].handler({
    payload: makePayload(),
    headers: new Headers({ cookie: stateCookie }),
    url: `https://cms.example.test/api/sso/callback?code=test-code&state=${location.searchParams.get('state')}`,
  })
  assert.equal(response.headers.get('location'), 'https://cms.example.test/admin')
  const cookies = response.headers.getSetCookie()
  assert.equal(cookies.length, 2)
  const saved = core.unseal(cookies[1].split(';')[0].split('=')[1], secret, 'session')
  assert.equal(saved.subject, subject)
  assert.equal(saved.accessToken, session.accessToken)
  assert.ok(saved.expiresAt <= Date.now() / 1000 + 3600)
  assert.equal(calls[0].options.body.get('code'), 'test-code')
  assert.match(calls[0].options.headers.Authorization, /^Basic /)
  assert.equal(calls[0].options.headers.apikey, 'public-test-key')
  assert.ok(calls[0].options.body.get('code_verifier'))
  assert.ok(
    calls.every(({ options }) => options.cache === 'no-store' && options.redirect === 'error'),
  )
})

test('callback refuses users without Backend and never provisions them', async () => {
  mockProvider({ roles: ['inventar'] })
  const { location, stateCookie } = await startLogin()
  const payload = makePayload()
  payload.find = async () => {
    assert.fail('No account lookup is allowed without the role')
  }
  const response = await supabaseEndpoints[1].handler({
    payload,
    headers: new Headers({ cookie: stateCookie }),
    url: `https://cms.example.test/api/sso/callback?code=test&state=${location.searchParams.get('state')}`,
  })
  assert.match(response.headers.get('location'), /sso_error=forbidden$/)
  assert.equal(response.headers.getSetCookie().length, 1)
})

test('server-side authorization reads current roles under the authenticated user’s RLS', async () => {
  const calls = mockProvider()
  assert.deepEqual(
    await core.verifyBackendIdentity(core.getSSOConfig(), session.accessToken),
    identity,
  )
  assert.equal(calls[1].url.searchParams.get('user_id'), `eq.${subject}`)
  assert.equal(calls[1].url.searchParams.get('scope_id'), 'is.null')
  assert.equal(calls[1].url.searchParams.get('role'), 'in.(admin,backend)')
  assert.equal(calls[1].options.headers.apikey, 'public-test-key')
  assert.equal(calls[1].options.headers.Authorization, `Bearer ${session.accessToken}`)
  mockProvider({ roles: ['admin', 'member'] })
  assert.deepEqual(await core.verifyBackendIdentity(core.getSSOConfig(), session.accessToken), identity)
  mockProvider({ roles: ['admin', 'backend'], scopeId: 'holz' })
  await assert.rejects(core.verifyBackendIdentity(core.getSSOConfig(), session.accessToken), {
    code: 'forbidden',
  })
  mockProvider({ roles: ['inventar', 'member'] })
  await assert.rejects(core.verifyBackendIdentity(core.getSSOConfig(), session.accessToken), {
    code: 'forbidden',
  })
  mockProvider({ verified: false })
  await assert.rejects(core.verifyBackendIdentity(core.getSSOConfig(), session.accessToken), {
    code: 'identity',
  })
})

test('frontend editor tokens require a verified identity and current global CMS role', async () => {
  const calls = mockProvider()
  assert.deepEqual(await core.verifyFrontendEditorIdentity(core.getSSOConfig(), session.accessToken), { subject, email: identity.email })
  assert.equal(calls[0].url.pathname, '/auth/v1/user')
  assert.equal(calls[1].url.searchParams.get('user_id'), `eq.${subject}`)
  for (const config of [{ roles: ['inventar'] }, { roles: ['backend'], scopeId: 'laser' }, { roles: [] }]) {
    mockProvider(config)
    await assert.rejects(core.verifyFrontendEditorIdentity(core.getSSOConfig(), session.accessToken), { code: 'forbidden' })
  }
  mockProvider({ verified: false })
  await assert.rejects(core.verifyFrontendEditorIdentity(core.getSSOConfig(), session.accessToken), { code: 'identity' })
  mockProvider({ fail: true })
  await assert.rejects(core.verifyFrontendEditorIdentity(core.getSSOConfig(), session.accessToken))
})

test('strategy authenticates the bound user and denies revoked roles and provider outages', async () => {
  mockProvider()
  const payload = makePayload()
  const headers = makeHeaders()
  const allowed = await supabaseStrategy.authenticate({ payload, headers })
  assert.equal(allowed.user.id, 42)
  assert.equal(allowed.user._strategy, 'supabase-oauth')
  mockProvider({ roles: [] })
  assert.equal((await supabaseStrategy.authenticate({ payload, headers })).user, null)
  mockProvider({ fail: true })
  assert.equal((await supabaseStrategy.authenticate({ payload, headers })).user, null)
})

test('strategy rejects cross-site origins, missing cookies, expiry and identity substitution', async () => {
  const calls = mockProvider()
  const payload = makePayload()
  for (const origin of ['https://evil.example.test', 'null']) {
    const headers = makeHeaders()
    headers.set('origin', origin)
    assert.equal((await supabaseStrategy.authenticate({ payload, headers })).user, null)
  }
  const headers = makeHeaders()
  headers.set('sec-fetch-site', 'cross-site')
  assert.equal((await supabaseStrategy.authenticate({ payload, headers })).user, null)
  assert.equal(
    (await supabaseStrategy.authenticate({ payload, headers: new Headers() })).user,
    null,
  )
  assert.equal(
    (
      await supabaseStrategy.authenticate({
        payload,
        headers: makeHeaders({ ...session, expiresAt: 1 }),
      })
    ).user,
    null,
  )
  assert.equal(calls.length, 0)
  assert.equal(
    (
      await supabaseStrategy.authenticate({
        payload,
        headers: makeHeaders({ ...session, subject: 'different' }),
      })
    ).user,
    null,
  )
})

test('new accounts are provisioned by immutable Supabase identity and password is not copied', async () => {
  const payload = makePayload()
  let created
  payload.find = async () => ({ docs: [] })
  payload.create = async (args) => {
    created = args
    return { id: 51, ...args.data }
  }
  const result = await ensurePayloadUser(payload, identity)
  assert.equal(result.supabaseId, subject)
  assert.equal(created.overrideAccess, true)
  assert.equal(created.data.password, undefined)
})

test('email collisions never silently link or overwrite an existing user', async () => {
  const payload = makePayload()
  payload.find = async ({ where }) => ({ docs: where.email ? [{ id: 99 }] : [] })
  payload.create = async () => {
    assert.fail('must not create')
  }
  await assert.rejects(ensurePayloadUser(payload, identity), { code: 'account_conflict' })
})

test('concurrent first logins reuse the account created by the other callback', async () => {
  const payload = makePayload()
  let attempt = 0
  payload.find = async () => ({ docs: ++attempt === 3 ? [{ id: 51, supabaseId: subject }] : [] })
  payload.create = async () => {
    throw new Error('unique constraint')
  }
  assert.equal((await ensurePayloadUser(payload, identity)).id, 51)
})

test('/me and refresh hooks never expose the cookie or mint a Payload JWT', async () => {
  const args = { req: { headers: makeHeaders(), payload: makePayload() } }
  const user = { id: 42 }
  assert.deepEqual(await supabaseMe({ args, user }), { user, exp: expiresAt })
  assert.deepEqual(await supabaseRefresh({ args, user }), {
    user,
    exp: expiresAt,
    refreshedToken: '',
    setCookie: false,
  })
})

test('Payload /me operation accepts the opaque session without JWT decoding or token disclosure', async () => {
  const payload = makePayload()
  const user = { id: 42, collection: 'users', _strategy: 'supabase-oauth' }
  payload.findByID = async () => ({ ...user })
  const headers = makeHeaders()
  const result = await meOperation({
    collection: {
      config: {
        slug: 'users',
        auth: { depth: 0, removeTokenFromResponses: true },
        hooks: { me: [supabaseMe] },
      },
    },
    currentToken: core.readCookie(headers, 'payload-token'),
    req: { payload, headers, user, pathname: '/api/users/me' },
  })
  assert.equal(result.user.id, 42)
  assert.equal(result.exp, expiresAt)
  assert.equal(result.token, undefined)
})

test('Payload’s actual logout handler clears the SSO session cookie', async () => {
  mockProvider()
  const payload = makePayload()
  payload.collections = {
    users: { config: { slug: 'users', auth: { cookies: { sameSite: 'Lax', secure: true } } } },
  }
  const response = await logoutHandler({
    payload,
    searchParams: new URLSearchParams(),
    headers: makeHeaders(),
    routeParams: { collection: 'users' },
    user: { id: 42, collection: 'users' },
    t: (key) => key,
  })
  assert.equal(response.status, 200)
  const expiredCookie = response.headers.get('set-cookie')
  assert.match(expiredCookie, /^payload-token=;/)
  assert.match(expiredCookie, /HttpOnly/)
  assert.equal(
    (
      await supabaseStrategy.authenticate({
        payload,
        headers: new Headers({ cookie: expiredCookie.split(';')[0] }),
      })
    ).user,
    null,
  )
})

test('configuration requires explicit enablement, complete credentials and HTTPS outside localhost', () => {
  process.env.SUPABASE_SSO_ENABLED = 'false'
  assert.throws(core.getSSOConfig, { code: 'configuration' })
  process.env.SUPABASE_SSO_ENABLED = 'true'
  process.env.NEXT_PUBLIC_SERVER_URL = 'http://cms.example.test'
  assert.throws(core.getSSOConfig, { code: 'configuration' })
  process.env.NEXT_PUBLIC_SERVER_URL = 'http://localhost:3001'
  assert.equal(core.getSSOConfig().cmsOrigin, 'http://localhost:3001')
  process.env.NEXT_PUBLIC_SERVER_URL = 'https://cms.example.test'
  const saved = process.env.SUPABASE_OAUTH_CLIENT_SECRET
  delete process.env.SUPABASE_OAUTH_CLIENT_SECRET
  assert.throws(core.getSSOConfig, { code: 'configuration' })
  process.env.SUPABASE_OAUTH_CLIENT_SECRET = saved
})
