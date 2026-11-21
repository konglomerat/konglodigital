import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['localhost', '127.0.0.1'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local')
const payload = await getPayload({ config })
const context = { disableRevalidate: true }
const slug = '3d-druck-preise'
const names = ['Mitgliederdrucke', 'Preise für Druckaufträge', 'Beispielrechnung Kamera-Case', 'Kamera-Case', 'Modell zum Beispiel']
const withoutIds = value => Array.isArray(value) ? value.map(withoutIds)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'id').map(([key, val]) => [key, withoutIds(val)])) : value
let transactionID
try {
  const { docs } = await payload.find({ collection: 'pages', draft: true, depth: 0, limit: 2, where: { werkbereich: { equals: '3d-druck' } } })
  assert.equal(docs.length, 1)
  const parent = docs[0]
  assert.equal(parent._status, 'published')
  const existing = await payload.find({ collection: 'pages', draft: true, depth: 0, limit: 2, where: { slug: { equals: slug } } })
  const source = parent.layout.filter(b => names.includes(b.blockName))
  if (!source.length) {
    assert.equal(existing.docs.length, 1)
    assert.ok(parent.layout.some(b => b.blockName === 'Preisübersicht öffnen'))
    console.log({ alreadyMoved: true, pageId: existing.docs[0].id })
  } else {
    assert.deepEqual(source.map(b => b.blockName), names)
    assert.equal(existing.docs.length, 0, 'An existing price page must not be overwritten')
    const inquiry = parent.layout.find(b => b.blockName === 'Druckauftrag anfragen')
    assert.ok(inquiry)
    await mkdir('.db-backups', { recursive: true })
    await writeFile(`.db-backups/3d-before-prices-move-${Date.now()}.json`, JSON.stringify(parent, null, 2), { mode: 0o600 })
    transactionID = await payload.db.beginTransaction()
    assert.ok(transactionID)
    const req = { transactionID }
    const page = await payload.create({ collection: 'pages', depth: 0, req, context, data: {
      title: 'Preise für 3D-Druck', slug, _status: 'published', hero: { type: 'none' }, sidebarLayout: [],
      meta: { title: 'Preise für 3D-Druck – Konglomerat', description: 'Spendenempfehlung für Mitglieder, Preise für Druckaufträge und eine Beispielrechnung.' },
      layout: withoutIds([...source, inquiry]),
    } })
    assert.deepEqual(withoutIds(page.layout), withoutIds([...source, inquiry]))
    const paragraph = text => ({ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', text, version: 1, format: 0, detail: 0, mode: 'normal', style: '' }] })
    const cta = {
      blockType: 'cta', blockName: 'Preisübersicht öffnen',
      richText: { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [
        { ...paragraph('Preise für 3D-Druck'), type: 'heading', tag: 'h2' },
        paragraph('Was kostet dein Druck? Hier findest du die Spendenempfehlung für Mitglieder, Preise für Druckaufträge und eine Beispielrechnung.'),
      ] } },
      links: [{ link: { type: 'reference', reference: { relationTo: 'pages', value: page.id }, label: 'Zur Preisübersicht', appearance: 'default' } }],
    }
    const layout = parent.layout.flatMap(b => b.id === source[0].id ? [cta] : names.includes(b.blockName) ? [] : [{
      ...b, ...(b.blockType === 'workshopInfo' ? { costs: 'Spendenempfehlung und Kosten für Druckaufträge findest du in der Preisübersicht.' } : {}),
    }])
    const saved = await payload.update({ collection: 'pages', id: parent.id, depth: 0, req, context, data: { layout, _status: 'published' } })
    assert.deepEqual(saved.sidebarLayout, parent.sidebarLayout)
    assert.equal(saved.layout.length, parent.layout.length - source.length + 1)
    assert.deepEqual(saved.layout.filter(b => b.blockName !== 'Preisübersicht öffnen' && b.blockType !== 'workshopInfo'), parent.layout.filter(b => !names.includes(b.blockName) && b.blockType !== 'workshopInfo'))
    await payload.db.commitTransaction(transactionID)
    transactionID = undefined
    console.log({ pageId: page.id, slug: page.slug, parentId: saved.id, movedBlocks: source.length })
  }
} catch (error) {
  if (transactionID) await payload.db.rollbackTransaction(transactionID)
  throw error
} finally { await payload.db.destroy() }
