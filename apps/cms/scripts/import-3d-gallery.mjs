import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

// Import only into the local workarea database. Assets use the configured media store.
const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['127.0.0.1', 'localhost'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local')
const directory = process.argv[2] || '/tmp/konglo-gallery'
const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'))
const payload = await getPayload({ config })
const blockName = 'Einblicke in die 3D-Druck-Werkstatt'
const textNode = text => ({ type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' })
const introContent = { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: [
  { type: 'heading', tag: 'h2', version: 1, direction: 'ltr', format: '', indent: 0, children: [textNode('Einblicke in die Werkstatt')] },
  { type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [textNode('Unsere Drucker, Materialien und Projekte – und ein Blick auf den Druck in Bewegung.')] },
] } }
async function importMedia(file, alt, dimensions) {
  const filename = path.basename(file)
  const { docs } = await payload.find({ collection: 'media', depth: 0, limit: 2, where: { filename: { equals: filename } } })
  assert.ok(docs.length < 2, `Mehrdeutiger Dateiname: ${filename}`)
  if (docs[0]) return docs[0]
  const media = await payload.create({ collection: 'media', filePath: file, data: { alt, ...dimensions } })
  console.log(`Medium importiert: ${filename} (${media.id})`)
  return media
}
try {
  const { docs } = await payload.find({ collection: 'pages', draft: true, depth: 0, limit: 2, where: { werkbereich: { equals: '3d-druck' } } })
  assert.equal(docs.length, 1)
  const page = docs[0]
  await mkdir('.db-backups', { recursive: true })
  await writeFile(`.db-backups/3d-before-gallery-${Date.now()}.json`, JSON.stringify(page, null, 2), { mode: 0o600 })
  const poster = await importMedia(path.join(directory, 'video-preview.jpg'), 'Vorschaubild: H2D beim Drucken kleiner Bauteile')
  const items = []
  for (const item of manifest) {
    assert.equal(path.basename(item.file), item.file)
    const video = item.file.endsWith('.mp4')
    const media = await importMedia(path.join(directory, item.file), item.alt, video ? { width: 720, height: 1280 } : undefined)
    items.push({ media: media.id, width: item.width, poster: video ? poster.id : null, caption: null })
  }
  const previous = page.layout.find(block => block.blockType === 'gallery' && block.blockName === blockName)
  const gallery = { ...(previous || {}), blockType: 'gallery', blockName, introContent, columnCount: '2', items }
  const layout = previous ? page.layout.map(block => block === previous ? gallery : block) : [...page.layout, gallery]
  const saved = await payload.update({ collection: 'pages', id: page.id, depth: 0, context: { disableRevalidate: true }, data: { layout, _status: page._status } })
  assert.deepEqual(saved.sidebarLayout, page.sidebarLayout)
  assert.equal(saved.layout.filter(block => block.blockName === blockName).length, 1)
  assert.equal(saved.layout.find(block => block.blockName === blockName).items.length, manifest.length)
  console.log({ pageId: page.id, galleryItems: manifest.length, status: saved._status })
} finally { await payload.db.destroy() }
