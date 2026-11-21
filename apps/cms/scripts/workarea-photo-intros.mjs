import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['localhost', '127.0.0.1'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local')
const payload = await getPayload({ config })
try {
  await mkdir('.db-backups', { recursive: true })
  for (const area of ['3d-druck', 'holz', 'laser']) {
    const { docs } = await payload.find({ collection: 'pages', draft: true, depth: 0, limit: 2, where: { werkbereich: { equals: area } } })
    assert.equal(docs.length, 1)
    const page = docs[0]
    assert.ok(page.hero.media)
    await writeFile(`.db-backups/${area}-before-photo-intro-${Date.now()}.json`, JSON.stringify(page, null, 2), { mode: 0o600 })
    const existing = page.layout.find(block => block.blockName === 'Werkstattfoto zum Einstieg')
    const image = area === '3d-druck' ? page.layout.find(block => block.blockType === 'gallery')?.items?.[0]?.media : page.hero.media
    assert.ok(image)
    const photo = { ...(existing || {}), blockType: 'mediaBlock', blockName: 'Werkstattfoto zum Einstieg', media: image }
    const layout = [photo, ...page.layout.filter(block => block !== existing)]
    const saved = await payload.update({ collection: 'pages', id: page.id, depth: 0, context: { disableRevalidate: true }, data: {
      hero: { ...page.hero, type: 'none', richText: null, links: [], media: image }, layout, _status: page._status,
    } })
    assert.equal(saved.hero.type, 'none')
    assert.equal(saved.layout[0].media, image)
    assert.deepEqual(saved.sidebarLayout, page.sidebarLayout)
    assert.deepEqual(saved.layout.slice(1), page.layout.filter(block => block !== existing))
    console.log(`${area}: Intro durch großes Foto ersetzt (${saved.layout[0].media})`)
  }
} finally { await payload.db.destroy() }
