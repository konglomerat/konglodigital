import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['127.0.0.1', 'localhost'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local')
const payload = await getPayload({ config })
try {
  const { docs } = await payload.find({ collection: 'pages', draft: true, depth: 0, limit: 2, where: { werkbereich: { equals: 'laser' } } })
  assert.equal(docs.length, 1)
  const page = docs[0]
  await mkdir('.db-backups', { recursive: true })
  await writeFile(`.db-backups/laser-before-related-projects-${Date.now()}.json`, JSON.stringify(page, null, 2), { mode: 0o600 })
  const block = {
    blockType: 'inventory', blockName: 'Showcase-Projekte zum Lasern',
    contentSource: 'showcase', heading: 'Hier entstanden: Projekte aus dem Laserbereich',
    description: 'Entdecke gelaserte Objekte, Bauideen und Umbauten aus dem Laserbereich.',
    tag: 'laser', columnCount: '2',
  }
  const layout = [...page.layout]
  const existing = layout.findIndex(b => b.blockType === 'inventory' && b.contentSource === 'showcase' && b.tag === 'laser')
  if (existing >= 0) layout[existing] = { ...block, id: layout[existing].id }
  else {
    const equipment = layout.findIndex(b => b.blockType === 'cardGrid' && b.blockName === 'Drei Lasercutter')
    assert.ok(equipment >= 0, 'Expected laser equipment section')
    layout.splice(equipment + 1, 0, block)
  }
  const saved = await payload.update({ collection: 'pages', id: page.id, context: { disableRevalidate: true }, data: { layout, _status: page._status } })
  assert.deepEqual(saved.sidebarLayout, page.sidebarLayout)
  console.log({ id: saved.id, mainBlocks: saved.layout.length, projectBlocks: saved.layout.filter(b => b.blockType === 'inventory' && b.contentSource === 'showcase') })
} finally { await payload.db.destroy() }
