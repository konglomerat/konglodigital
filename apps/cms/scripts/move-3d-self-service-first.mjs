import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['127.0.0.1', 'localhost'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local')
const activeFields = value => Array.isArray(value) ? value.map(activeFields)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value)
    .filter(([key]) => !(value.type === 'custom' && key === 'reference'))
    .map(([key, val]) => [key, activeFields(val)])) : value
const payload = await getPayload({ config })
try {
  const { docs } = await payload.find({ collection: 'pages', draft: true, depth: 0, limit: 2, where: { werkbereich: { equals: '3d-druck' } } })
  assert.equal(docs.length, 1)
  const page = docs[0]
  const matches = page.layout.filter(block => block.blockType === 'cardGrid' && block.blockName === '3D-Druck Self-Service')
  assert.equal(matches.length, 1)
  const block = matches[0]
  const layout = [block, ...page.layout.filter(item => item.id !== block.id)]
  if (page.layout[0].id !== block.id) {
    await mkdir('.db-backups', { recursive: true })
    await writeFile(`.db-backups/3d-before-self-service-first-${Date.now()}.json`, JSON.stringify(page, null, 2), { mode: 0o600 })
    const saved = await payload.update({ collection: 'pages', id: page.id, depth: 0, context: { disableRevalidate: true }, data: { layout, _status: page._status } })
    assert.deepEqual(activeFields(saved.layout), activeFields(layout))
    assert.deepEqual(saved.sidebarLayout, page.sidebarLayout)
  }
  console.log({ pageId: page.id, firstBlock: block.blockName, blocks: layout.length })
} finally { await payload.db.destroy() }
