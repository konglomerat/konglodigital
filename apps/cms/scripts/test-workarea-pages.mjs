/** Integration test; refuses every database except the dedicated local fixture. */
import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
import { werkbereichDefaultBlocks } from '../../../src/lib/werkbereich-content.ts'

const dbURL = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['localhost', '127.0.0.1'].includes(dbURL.hostname) && dbURL.pathname === '/konglo_cms_workareas_local', 'Local fixture DB required')
const payload = await getPayload({ config })
const context = { disableRevalidate: true }
let checks = 0
const check = (label) => { checks++; console.log(`PASS ${label}`) }
try {
  const all = await payload.find({ collection: 'pages', draft: true, depth: 0, pagination: false })
  assert.equal(all.docs.length, 16)
  assert.equal(new Set(all.docs.map((p) => p.werkbereich)).size, 16)
  check('16 Werkbereiche, exactly one page each')
  const wood = all.docs.find((p) => p.werkbereich === 'holz')
  for (const slug of ['holz', 'werkbereich-holz', 'werkbereiche-holz', 'werkbereich-werkbereich-holz']) {
    await assert.rejects(payload.create({ collection: 'pages', draft: true, context,
      data: { title: 'Duplicate test', slug, hero: { type: 'none' }, layout: [] },
    }), (e) => e.name === 'ValidationError' && e.data.errors.some((v) => v.message.includes('bereits eine Seite')))
  }
  await assert.rejects(payload.create({ collection: 'pages', draft: true, context,
    data: { title: 'Different title and slug', slug: 'another-page', werkbereich: 'holz', layout: [] },
  }), (e) => e.name === 'ValidationError')
  check('aliases and duplicate dropdown assignments rejected, including drafts')

  for (const slug of ['holz', '3d-druck']) {
    const original = all.docs.find((p) => p.werkbereich === slug)
    const updated = await payload.update({ collection: 'pages', id: original.id, context,
      data: {
        title: slug === 'holz' ? 'Holzwerkstatt' : '3D Druck', _status: 'published',
        meta: { description: 'Lokale Vorschau mit Beispieldaten – noch nicht für die Live-Webseite freigegeben.' },
        layout: [
          { blockType: 'workshopInfo', heading: 'Auf einen Blick', location: 'Beispielraum · lokale Vorschau', access: 'Einweisung mit dem Werkbereichsteam abstimmen.', hours: 'Termine werden vom Team ergänzt.', costs: 'Konditionen vor der Nutzung mit dem Team klären.' },
          { blockType: 'equipment', heading: 'Ausstattung', description: 'Beispiel für die redaktionelle Ausstattungsliste.', items: [{ name: slug === 'holz' ? 'Werkbank' : 'FDM-Drucker', description: 'Beschreibung und Möglichkeiten können hier ergänzt werden.', requirement: 'Einweisung nach Absprache' }] },
          ...werkbereichDefaultBlocks(slug),
          { blockType: 'contact', heading: 'Kontakt zum Werkbereich', email: `${slug}@example.test` },
        ],
      },
    })
    assert.equal(updated.slug, `werkbereich-${slug}`)
    const reread = await payload.findByID({ collection: 'pages', id: original.id, depth: 0 })
    assert.equal(reread.layout[0].blockType, 'workshopInfo')
    assert.equal(reread.layout[1].items[0].requirement, 'Einweisung nach Absprache')
  }
  check('both blocks persist and publish; same-page editing allowed')
  await payload.update({ collection: 'pages', id: wood.id, draft: true, context, data: { title: 'PRIVATE DRAFT – nicht öffentlich' } })
  const publicWood = await payload.find({ collection: 'pages', overrideAccess: false, draft: false,
    where: { slug: { equals: 'werkbereich-holz' } }, depth: 0,
  })
  assert.equal(publicWood.docs[0].title, 'Holzwerkstatt')
  const publicAll = await payload.find({ collection: 'pages', overrideAccess: false, draft: false, pagination: false, depth: 0 })
  assert.equal(publicAll.docs.length, 2)
  check('unpublished drafts stay private, published version remains visible')
  const laser = all.docs.find((p) => p.werkbereich === 'laser')
  await assert.rejects(payload.update({ collection: 'pages', id: laser.id, draft: true, context, data: { werkbereich: 'holz' } }), (e) => e.name === 'ValidationError')
  check('moving an existing page onto an occupied area is rejected')
  // Keep the local editor and local public sample consistent after the draft test.
  await payload.update({ collection: 'pages', id: wood.id, context, data: { title: 'Holzwerkstatt', _status: 'published' } })
  console.log(`${checks} integration checks passed; two local demo pages and 14 drafts ready.`)
} finally { await payload.db.destroy() }
