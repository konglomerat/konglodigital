import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

function setup({ authorized = true, failSave = false, defaultIds = false } = {}) {
  const exports = {}
  const events = []
  let page = { id: 21, title: 'Original', layout: [], sidebarLayout: [], hero: { type: 'none' }, meta: {}, updatedAt: '2026-11-20T00:00:00Z', _status: 'published' }
  const payload = {
    db: { sessions: { tx: { db: { execute: async () => events.push('lock') } } }, beginTransaction: async () => 'tx', commitTransaction: async () => events.push('commit'), rollbackTransaction: async () => events.push('rollback') },
    findByID: async () => { events.push('read'); const result = structuredClone(page); if (defaultIds) result.sidebarLayout = [{ id: Math.random().toString(), blockType: 'appSlot', slot: 'calendarUpcoming' }]; return result },
    find: async () => ({ docs: [] }),
    update: async args => { events.push('update'); assert.equal(args.overrideAccess, false); assert.equal(args.req.transactionID, 'tx'); assert.equal(args.req.user.id, 7); if (failSave) throw new Error('save failed'); page = { ...page, ...args.data, updatedAt: '2026-11-20T00:01:00Z' }; return page },
  }
  const mocks = {
    'node:crypto': { createHash },
    '@payloadcms/db-postgres': { sql: (...args) => args },
    '../auth/supabase/core': { getSSOConfig: () => ({}), verifyFrontendEditorIdentity: async () => { if (!authorized) throw new Error('forbidden'); return { subject: 'user' } } },
    '../auth/supabase/endpoints': { ensurePayloadUser: async () => ({ id: 7 }) },
  }
  const source = ts.transpileModule(readFileSync(new URL('../src/endpoints/inlinePages.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  runInNewContext(source, { exports, require: name => { assert.ok(mocks[name], name); return mocks[name] }, Response, Buffer })
  const request = (body, token = true) => ({ routeParams: { id: '21' }, payload, headers: new Headers(token ? { authorization: 'Bearer test' } : {}), text: async () => JSON.stringify(body) })
  const [get, patch] = exports.inlinePageEndpoints
  return { events, get: (token = true) => get.handler(request(undefined, token)), save: body => patch.handler(request(body)), mutate: () => { page.title = 'Concurrent edit' } }
}

test('unauthenticated and unauthorized requests cannot read drafts or write', async () => {
  const noToken = setup(); assert.equal((await noToken.get(false)).status, 401); assert.deepEqual(noToken.events, [])
  const denied = setup({ authorized: false }); assert.equal((await denied.get()).status, 403); assert.equal((await denied.save({})).status, 403); assert.deepEqual(denied.events, [])
})
test('save locks before reading, uses CMS permissions and strips non-editor fields', async () => {
  const api = setup(); const current = await (await api.get()).json(); api.events.length = 0
  const result = await api.save({ ...current, page: { ...current.page, title: 'Edited', slug: 'injected', werkbereich: 'holz', _status: 'draft' } })
  assert.equal(result.status, 200); const saved = await result.json(); assert.equal(saved.page.title, 'Edited'); assert.equal(saved.page.slug, undefined); assert.equal(saved.page.werkbereich, undefined); assert.notEqual(saved.revision, current.revision)
  assert.deepEqual(api.events, ['lock', 'read', 'update', 'commit'])
})
test('concurrent edits roll back without overwriting the newer content', async () => {
  const api = setup(); const current = await (await api.get()).json(); api.mutate(); api.events.length = 0
  assert.equal((await api.save(current)).status, 409); assert.deepEqual(api.events, ['lock', 'read', 'rollback'])
})
test('generated default block IDs do not create false content conflicts', async () => {
  const api = setup({ defaultIds: true }); const current = await (await api.get()).json()
  assert.equal((await api.save({ ...current, page: { ...current.page, title: 'Edited' } })).status, 200)
})
test('validation rejects incomplete documents and write failures roll back', async () => {
  const api = setup(); assert.equal((await api.save({ page: { title: '' } })).status, 400); assert.deepEqual(api.events, [])
  const broken = setup({ failSave: true }); const current = await (await broken.get()).json(); broken.events.length = 0
  assert.equal((await broken.save(current)).status, 500); assert.deepEqual(broken.events, ['lock', 'read', 'update', 'rollback'])
})
