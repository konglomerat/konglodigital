import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['127.0.0.1', 'localhost'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local')
const payload = await getPayload({ config })
try {
  for (const werkbereich of ['laser', '3d-druck']) {
    const { docs } = await payload.find({ collection: 'pages', draft: true, depth: 0, limit: 2, where: { werkbereich: { equals: werkbereich } } })
    assert.equal(docs.length, 1)
    const page = docs[0]
    const sidebar = [...(page.sidebarLayout ?? [])]
    const index = sidebar.findIndex(b => b.blockName === 'Ort')
    if (index >= 0 && sidebar[index].blockType === 'contact') {
      assert.equal(sidebar[index].mapUrl, '/resources/laser-und-3d-druckwerkstatt')
      console.log({ werkbereich, alreadyUpdated: true })
      continue
    }
    await mkdir('.db-backups', { recursive: true })
    await writeFile(`.db-backups/${werkbereich}-before-location-map-${Date.now()}.json`, JSON.stringify(page, null, 2), { mode: 0o600 })
    const block = { blockType: 'contact', blockName: 'Ort', heading: 'Ort', mapUrl: '/resources/laser-und-3d-druckwerkstatt', links: [] }
    if (index >= 0) sidebar[index] = block
    else sidebar.unshift(block)
    const saved = await payload.update({ collection: 'pages', id: page.id, depth: 0, context: { disableRevalidate: true }, data: { sidebarLayout: sidebar, _status: page._status } })
    assert.deepEqual(saved.layout, page.layout)
    assert.deepEqual(saved.sidebarLayout.filter(b => b.blockName !== 'Ort'), page.sidebarLayout.filter(b => b.blockName !== 'Ort'))
    console.log({ werkbereich, pageId: saved.id, sidebar: saved.sidebarLayout.map(b => b.blockName) })
  }
} finally { await payload.db.destroy() }
