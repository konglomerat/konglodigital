import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['127.0.0.1', 'localhost'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local')
const payload = await getPayload({ config })
try {
  const { docs } = await payload.find({ collection: 'pages', draft: true, depth: 0, limit: 2, where: { werkbereich: { equals: '3d-druck' } } })
  assert.equal(docs.length, 1)
  const page = docs[0]
  await mkdir('.db-backups', { recursive: true })
  await writeFile(`.db-backups/3d-before-related-projects-${Date.now()}.json`, JSON.stringify(page, null, 2), { mode: 0o600 })
  const block = {
    blockType: 'inventory', blockName: 'Showcase-Projekte zum 3D-Druck',
    contentSource: 'showcase', heading: 'Hier entstanden: Projekte aus dem 3D-Druck',
    description: 'Entdecke, was mit unseren 3D-Druckern entsteht – Ideen, Umbauten und fertige Projekte aus dem Showcase.',
    tag: '3d-druck', columnCount: '2',
  }
  const layout = [...page.layout]
  const existing = layout.findIndex(b => b.blockType === 'inventory' && b.contentSource === 'showcase' && b.tag === '3d-druck')
  if (existing >= 0) layout[existing] = { ...block, id: layout[existing].id }
  else {
    const printers = layout.findIndex(b => b.blockType === 'inventory' && b.tag === '3ddrucker')
    assert.ok(printers >= 0)
    layout.splice(printers + 1, 0, block)
  }
  const saved = await payload.update({ collection: 'pages', id: page.id, context: { disableRevalidate: true }, data: { layout, _status: page._status } })
  assert.equal(saved.sidebarLayout.length, page.sidebarLayout.length)
  console.log({ id: saved.id, mainBlocks: saved.layout.length, projectBlocks: saved.layout.filter(b => b.blockType === 'inventory' && b.contentSource === 'showcase') })
} finally { await payload.db.destroy() }
