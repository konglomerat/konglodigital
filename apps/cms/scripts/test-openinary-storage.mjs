/** Local Payload + real HTTP adapter integration. Never contacts live Openinary. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

const database = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['localhost', '127.0.0.1'].includes(database.hostname) && database.pathname === '/konglo_cms_workareas_local', 'Local test database required')
const localDir = await mkdtemp(path.join(tmpdir(), 'konglo-openinary-test-'))
const files = new Map()
let uploads = 0
let fail = false
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/api/upload' && req.method === 'POST') {
      assert.equal(req.headers.authorization, 'Bearer synthetic-test-key')
      const form = await new Request('http://localhost/upload', { method: 'POST', headers: req.headers, body: Readable.toWeb(req), duplex: 'half' }).formData()
      uploads++
      if (fail) { res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'test failure' })); return }
      const file = form.get('files')
      const name = form.get('names')
      assert.equal(file.name, name)
      const key = `${form.get('folder')}/${name}`
      files.set(key, { data: Buffer.from(await file.arrayBuffer()), type: file.type })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, files: [{ path: key }] }))
      return
    }
    const key = decodeURIComponent(req.url.replace('/api/download/', ''))
    const file = files.get(key)
    res.writeHead(file ? 200 : 404, { 'Content-Type': file?.type || 'text/plain' })
    res.end(file?.data || 'missing')
  } catch (error) { res.writeHead(500); res.end(error.message) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
process.env.OPENINARY_BASE_URL = `http://127.0.0.1:${server.address().port}`
process.env.OPENINARY_API_KEY = 'synthetic-test-key'
process.env.OPENINARY_FOLDER = 'konglo-cms/test'
process.env.PAYLOAD_MEDIA_DIR = localDir
const { getPayload } = await import('payload')
const { default: config } = await import('../src/payload.config.ts')
const payload = await getPayload({ config })
const ids = []
let checks = 0
const check = (label) => { checks++; console.log(`PASS ${label}`) }
const png = await sharp({ create: { width: 1000, height: 700, channels: 3, background: '#f1d4e0' } }).png().toBuffer()
const file = { data: png, name: 'cms-test.png', mimetype: 'image/png', size: png.length }
try {
  let doc = await payload.create({ collection: 'media', data: { alt: 'Local test image' }, file })
  ids.push(doc.id)
  assert.ok(doc.url.startsWith(process.env.OPENINARY_BASE_URL + '/api/download/konglo-cms/test/'))
  const variants = Object.values(doc.sizes).filter(size => size.filename)
  assert.ok(variants.length >= 4)
  for (const url of [doc.url, ...variants.map(size => size.url)]) assert.equal((await fetch(url)).status, 200)
  assert.equal(uploads, variants.length + 1)
  assert.ok(doc.thumbnailURL?.startsWith(process.env.OPENINARY_BASE_URL), `thumbnail URL: ${doc.thumbnailURL}`)
  check('original, resized variants and admin thumbnail use Openinary URLs')

  const originalPrefix = doc.prefix
  const beforeEdit = uploads
  doc = await payload.update({ collection: 'media', id: doc.id, data: { alt: 'Changed alt text', prefix: '../../other-library', _objectKey: 'tampered' } })
  assert.equal(doc.prefix, originalPrefix)
  assert.equal(uploads, beforeEdit)
  check('metadata edits preserve storage identity and never re-upload')

  const duplicate = await payload.create({ collection: 'media', data: { alt: 'Same filename' }, file })
  ids.push(duplicate.id)
  assert.notEqual(duplicate.url, doc.url)
  const oldURL = doc.url
  doc = await payload.update({ collection: 'media', id: doc.id, data: { alt: 'Replacement' }, file })
  assert.notEqual(doc.url, oldURL)
  assert.equal((await fetch(oldURL)).status, 200)
  check('same-name uploads and replacements have unique paths; old public assets survive')

  fail = true
  const goodURL = doc.url
  await assert.rejects(payload.update({ collection: 'media', id: doc.id, data: { alt: 'Must roll back' }, file }), /Openinary-Upload fehlgeschlagen/)
  fail = false
  const unchanged = await payload.findByID({ collection: 'media', id: doc.id })
  assert.equal(unchanged.url, goodURL)
  check('upstream failure rejects save and preserves the existing media record')

  const singleFrame = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
  const firstFrame = Buffer.from(singleFrame.subarray(19, -1))
  firstFrame[3] = 0; firstFrame[4] = 10
  const secondFrame = Buffer.from(firstFrame)
  secondFrame[4] = 20; secondFrame[20] = 0x4c
  const gifBytes = Buffer.concat([singleFrame.subarray(0, 19), firstFrame, secondFrame, Buffer.from([0x3b])])
  assert.equal((await sharp(gifBytes, { animated: true }).metadata()).pages, 2)
  const gif = await payload.create({ collection: 'media', data: { alt: 'GIF test' }, file: { data: gifBytes, name: 'animated.gif', mimetype: 'image/gif', size: gifBytes.length } })
  ids.push(gif.id)
  const gifResult = Buffer.from(await (await fetch(gif.url)).arrayBuffer())
  assert.equal((await sharp(gifResult, { animated: true }).metadata()).pages, 2)
  check('animated GIF retains both frames and uses the original-download endpoint')

  const beforePDF = uploads
  const pdfBytes = Buffer.from('%PDF-1.4\n% Local upload test\n%%EOF')
  const pdf = await payload.create({ collection: 'media', data: { alt: 'Local PDF' }, file: { data: pdfBytes, name: 'cms-test.pdf', mimetype: 'application/pdf', size: pdfBytes.length } })
  ids.push(pdf.id)
  assert.equal(pdf.prefix, '')
  assert.ok(pdf.url.includes('/api/media/file/'))
  assert.equal(uploads, beforePDF)
  assert.deepEqual(await readFile(path.join(localDir, pdf.filename)), pdfBytes)
  check('PDF documents retain the existing persistent storage path')

  const beforeUnauthorized = uploads
  await assert.rejects(payload.create({ collection: 'media', overrideAccess: false, data: { alt: 'Forbidden' }, file }), e => e.status === 403)
  assert.equal(uploads, beforeUnauthorized)
  check('anonymous upload is rejected before reaching storage')

  const retainedURL = doc.url
  await payload.delete({ collection: 'media', id: doc.id })
  ids.splice(ids.indexOf(doc.id), 1)
  assert.equal((await fetch(retainedURL)).status, 200)
  check('deleting a CMS entry does not destroy shared media assets')
  console.log(`${checks} Openinary integration checks passed (local HTTP fixture only).`)
} finally {
  fail = false
  for (const id of ids) await payload.delete({ collection: 'media', id }).catch(() => {})
  await payload.db.destroy()
  await new Promise(resolve => server.close(resolve))
  await rm(localDir, { recursive: true, force: true })
}
