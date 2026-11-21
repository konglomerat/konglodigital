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
  const source = page.layout.findIndex(b => b.blockType === 'equipment' && b.blockName === 'Zubehör und Trocknung')
  if (source < 0) {
    const existing = page.layout.findIndex(b => b.blockType === 'inventory' && b.tag === '3D-Druck Zubehör')
    assert.ok(existing >= 0)
    if (page.layout[existing].columnCount !== '3') {
      await mkdir('.db-backups', { recursive: true })
      await writeFile(`.db-backups/3d-before-accessory-columns-${Date.now()}.json`, JSON.stringify(page, null, 2), { mode: 0o600 })
      const layout = page.layout.map((b, i) => i === existing ? { ...b, columnCount: '3' } : b)
      const saved = await payload.update({ collection: 'pages', id: page.id, depth: 0, context: { disableRevalidate: true }, data: { layout, _status: page._status } })
      assert.deepEqual(saved.sidebarLayout, page.sidebarLayout)
      assert.deepEqual(saved.layout.filter((_, i) => i !== existing), page.layout.filter((_, i) => i !== existing))
      assert.equal(saved.layout[existing].columnCount, '3')
    }
    console.log({ pageId: page.id, accessoriesPerRow: 3 })
  } else {
    await mkdir('.db-backups', { recursive: true })
    await writeFile(`.db-backups/3d-before-accessories-inventory-${Date.now()}.json`, JSON.stringify(page, null, 2), { mode: 0o600 })
    const layout = [...page.layout]
    layout[source] = {
      blockType: 'inventory', blockName: 'Zubehör und Trocknung',
      contentSource: 'inventory', heading: 'Zubehör und Filament trocknen',
      description: 'Filament trocknest du im SOVOL SH02 oder im AMS 2 am H2D – die passende Einstellung bitte mit dem Team abstimmen. Für deine Projekte gibt es Messing-Einschmelzgewinde in M2, M2,5, M3, M4, M5 und M6, M3-/M4-Zylinderkopfschrauben sowie vernickelte Neodym-Scheibenmagnete (10 × 3 mm, N52). Fotos und Details zu unserem Zubehör findest du im Inventar.',
      tag: '3D-Druck Zubehör', columnCount: '3',
    }
    const saved = await payload.update({ collection: 'pages', id: page.id, depth: 0, context: { disableRevalidate: true }, data: { layout, _status: page._status } })
    assert.equal(saved.layout.length, page.layout.length)
    assert.deepEqual(saved.sidebarLayout, page.sidebarLayout)
    assert.deepEqual(saved.layout.filter((_, i) => i !== source), page.layout.filter((_, i) => i !== source))
    assert.equal(saved.layout[source].tag, '3D-Druck Zubehör')
    console.log({ pageId: saved.id, accessories: saved.layout[source] })
  }
} finally { await payload.db.destroy() }
