import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['localhost', '127.0.0.1'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local')
const payload = await getPayload({ config })
const context = { disableRevalidate: true }
const title = 'Selbst drucken – Schritt für Schritt'
const slug = '3d-druck-anleitung'
const withoutIds = value => Array.isArray(value) ? value.map(withoutIds)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'id').map(([key, val]) => [key, withoutIds(val)])) : value
let transactionID
try {
  const { docs } = await payload.find({ collection: 'pages', draft: true, depth: 0, limit: 2, where: { werkbereich: { equals: '3d-druck' } } })
  assert.equal(docs.length, 1)
  const parent = docs[0]
  assert.equal(parent._status, 'published')
  const existing = await payload.find({ collection: 'pages', draft: true, depth: 0, limit: 2, where: { slug: { equals: slug } } })
  const steps = parent.layout.find(b => b.blockType === 'content' && b.blockName === title)
  if (!steps) {
    assert.equal(existing.docs.length, 1, 'Missing source steps and destination page')
    assert.ok(parent.layout.some(b => b.blockName === 'Druckanleitung öffnen'))
    console.log({ alreadyMoved: true, guide: existing.docs[0].id })
  } else {
    assert.equal(existing.docs.length, 0, 'An existing guide must not be overwritten')
    const downloads = parent.layout.find(b => b.blockType === 'downloads' && b.blockName === 'Software und Anleitung')
    const selfService = parent.layout.find(b => b.blockType === 'cardGrid' && b.cards?.some(card => card.link?.url === '/printers'))
    assert.ok(downloads && selfService)
    await mkdir('.db-backups', { recursive: true })
    await writeFile(`.db-backups/3d-before-guide-move-${Date.now()}.json`, JSON.stringify(parent, null, 2), { mode: 0o600 })
    const guideSteps = withoutIds(steps)
    for (const column of guideSteps.columns) {
      column.richText.root.children = column.richText.root.children.filter(node => !(node.type === 'heading' && node.tag === 'h2'))
      for (const node of column.richText.root.children) if (node.type === 'heading' && node.tag === 'h3') node.tag = 'h2'
    }
    assert.equal(guideSteps.columns.flatMap(c => c.richText.root.children).filter(n => n.type === 'heading').length, 7)
    transactionID = await payload.db.beginTransaction()
    assert.ok(transactionID, 'Expected PostgreSQL transaction')
    const req = { transactionID }
    const guide = await payload.create({ collection: 'pages', req, context, data: {
      title, slug, _status: 'published', hero: { type: 'none' }, sidebarLayout: [],
      meta: { title: '3D-Druck-Anleitung – Selbst drucken im Konglomerat', description: 'Vom Einrichten von Bambu Studio bis zum fertigen Druck: die Anleitung für deinen Einstieg.' },
      layout: [withoutIds(selfService), guideSteps, withoutIds(downloads)],
    } })
    const paragraph = text => ({ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', text, version: 1, format: 0, detail: 0, mode: 'normal', style: '' }] })
    const cta = {
      blockType: 'cta', blockName: 'Druckanleitung öffnen',
      richText: { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [
        { ...paragraph(title), type: 'heading', tag: 'h2' },
        paragraph('Von Bambu Studio bis zum fertigen Teil: Die Anleitung führt dich in sieben Schritten durch deinen ersten Druck.'),
      ] } },
      links: [{ link: { type: 'reference', reference: { relationTo: 'pages', value: guide.id }, label: 'Zur Druckanleitung', appearance: 'default' } }],
    }
    const layout = parent.layout.filter(b => b.id !== downloads.id).map(b => b.id === steps.id ? cta : b)
    const saved = await payload.update({ collection: 'pages', id: parent.id, req, context, data: {
      layout, meta: { ...parent.meta, description: 'Drucker, Materialien, Kosten und der Einstieg in dein 3D-Druck-Projekt.' }, _status: 'published',
    } })
    assert.deepEqual(saved.sidebarLayout, parent.sidebarLayout)
    assert.equal(saved.layout.length, parent.layout.length - 1)
    await payload.db.commitTransaction(transactionID)
    transactionID = undefined
    console.log({ guideId: guide.id, slug: guide.slug, blocks: guide.layout.length, parentId: saved.id, mainBlocks: saved.layout.length })
  }
} catch (error) {
  if (transactionID) await payload.db.rollbackTransaction(transactionID)
  throw error
} finally { await payload.db.destroy() }
