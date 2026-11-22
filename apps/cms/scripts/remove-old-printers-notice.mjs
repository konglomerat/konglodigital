import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['127.0.0.1', 'localhost'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local')
const payload = await getPayload({ config })
// Payload can return an inactive reference alongside a custom URL after saving.
const activeFields = value => Array.isArray(value) ? value.map(activeFields)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value)
    .filter(([key]) => !(value.type === 'custom' && key === 'reference'))
    .map(([key, val]) => [key, activeFields(val)])) : value
try {
  const { docs } = await payload.find({ collection: 'pages', draft: true, depth: 0, limit: 2, where: { werkbereich: { equals: '3d-druck' } } })
  assert.equal(docs.length, 1)
  const page = docs[0]
  const layout = page.layout.filter(b => !(b.blockType === 'content' && b.blockName === 'Ältere Drucker abzugeben'))
  if (layout.length !== page.layout.length) {
    assert.equal(layout.length, page.layout.length - 1)
    await mkdir('.db-backups', { recursive: true })
    await writeFile(`.db-backups/3d-before-old-printers-removal-${Date.now()}.json`, JSON.stringify(page, null, 2), { mode: 0o600 })
    const saved = await payload.update({ collection: 'pages', id: page.id, depth: 0, context: { disableRevalidate: true }, data: { layout, _status: page._status } })
    assert.deepEqual(activeFields(saved.layout), activeFields(layout))
    assert.deepEqual(saved.sidebarLayout, page.sidebarLayout)
  }
  console.log({ pageId: page.id, removed: page.layout.length - layout.length })
} finally { await payload.db.destroy() }
