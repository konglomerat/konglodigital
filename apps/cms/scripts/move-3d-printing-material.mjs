import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['localhost', '127.0.0.1'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local')
const payload = await getPayload({ config })
const context = { disableRevalidate: true }
const title = 'Filament und Material'
const slug = '3d-druck-material'
const withoutIds = value => Array.isArray(value) ? value.map(withoutIds)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'id').map(([key, val]) => [key, withoutIds(val)])) : value
let transactionID
try {
  const { docs } = await payload.find({ collection: 'pages', draft: true, depth: 0, limit: 2, where: { werkbereich: { equals: '3d-druck' } } })
  assert.equal(docs.length, 1)
  const parent = docs[0]
  assert.equal(parent._status, 'published')
  const existing = await payload.find({ collection: 'pages', draft: true, depth: 0, limit: 2, where: { slug: { equals: slug } } })
  const source = parent.layout.find(b => b.blockType === 'content' && b.blockName === title)
  if (!source) {
    assert.equal(existing.docs.length, 1, 'Missing source and destination')
    assert.ok(parent.layout.some(b => b.blockName === 'Materialübersicht öffnen'))
    console.log({ alreadyMoved: true, materialPage: existing.docs[0].id })
  } else {
    assert.equal(existing.docs.length, 0, 'An existing material page must not be overwritten')
    await mkdir('.db-backups', { recursive: true })
    await writeFile(`.db-backups/3d-before-material-move-${Date.now()}.json`, JSON.stringify(parent, null, 2), { mode: 0o600 })
    const content = withoutIds(source)
    for (const column of content.columns) {
      column.richText.root.children = column.richText.root.children.filter(node => !(node.type === 'heading' && node.tag === 'h2' && node.children.map(child => child.text ?? '').join('') === title))
      for (const node of column.richText.root.children) if (node.type === 'heading' && node.tag === 'h3') node.tag = 'h2'
    }
    const paragraphs = block => block.columns.flatMap(c => c.richText.root.children).filter(n => n.type === 'paragraph')
    assert.deepEqual(paragraphs(content), paragraphs(withoutIds(source)))
    transactionID = await payload.db.beginTransaction()
    assert.ok(transactionID, 'Expected PostgreSQL transaction')
    const req = { transactionID }
    const page = await payload.create({ collection: 'pages', req, context, data: {
      title, slug, _status: 'published', hero: { type: 'none' }, sidebarLayout: [],
      meta: { title: 'Filament und Material – 3D-Druck im Konglomerat', description: 'Filamenttypen, vorhandene Materialien und Hinweise zum Einsatz eigener Filamente.' },
      layout: [content],
    } })
    const paragraph = text => ({ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', text, version: 1, format: 0, detail: 0, mode: 'normal', style: '' }] })
    const cta = {
      blockType: 'cta', blockName: 'Materialübersicht öffnen',
      richText: { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [
        { ...paragraph(title), type: 'heading', tag: 'h2' },
        paragraph('Welche Filamente gibt es und was solltest du bei eigenem Material beachten? Hier findest du die Materialübersicht für deinen Druck.'),
      ] } },
      links: [{ link: { type: 'reference', reference: { relationTo: 'pages', value: page.id }, label: 'Zur Materialübersicht', appearance: 'default' } }],
    }
    const saved = await payload.update({ collection: 'pages', id: parent.id, req, context, data: {
      layout: parent.layout.map(b => b.id === source.id ? cta : b), _status: 'published',
    } })
    assert.deepEqual(saved.sidebarLayout, parent.sidebarLayout)
    assert.equal(saved.layout.length, parent.layout.length)
    await payload.db.commitTransaction(transactionID)
    transactionID = undefined
    console.log({ pageId: page.id, slug: page.slug, parentId: saved.id, mainBlocks: saved.layout.length })
  }
} catch (error) {
  if (transactionID) await payload.db.rollbackTransaction(transactionID)
  throw error
} finally { await payload.db.destroy() }
