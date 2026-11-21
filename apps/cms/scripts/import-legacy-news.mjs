import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { getPayload } from 'payload'
import { convertMarkdownToLexical, defaultEditorConfig, sanitizeServerEditorConfig } from '@payloadcms/richtext-lexical'
import config from '../src/payload.config.ts'

const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['localhost', '127.0.0.1'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local', 'Local migration database required')
const source = JSON.parse(await readFile(process.argv[2], 'utf8'))
const previousExport = process.argv[3] === 'refresh-from' ? JSON.parse(await readFile(process.argv[4], 'utf8')) : null
assert.ok(source.rows.length > 0)
assert.equal(new Set(source.rows.map(row => row.sourceUrl)).size, source.rows.length)
for (const row of source.rows) {
  assert.ok(/^https:\/\/konglomerat\.org\/aktuelles\/\d{4}\//.test(row.sourceUrl))
  assert.ok(row.title && !Number.isNaN(Date.parse(row.publishedAt)))
}
const payload = await getPayload({ config })
try {
  const existing = await payload.find({ collection: 'posts', draft: true, pagination: false, depth: 0 })
  await mkdir('.db-backups', { recursive: true })
  await writeFile(`.db-backups/posts-before-legacy-news-${Date.now()}.json`, JSON.stringify(existing.docs, null, 2), { mode: 0o600 })
  const editorConfig = await sanitizeServerEditorConfig(defaultEditorConfig, payload.config)
  const normalize = value => JSON.parse(JSON.stringify(value, (key, item) => key === 'id' ? undefined : item))
  const slugs = new Set(existing.docs.map(post => post.slug))
  const report = []
  for (const row of source.rows) {
    const found = existing.docs.find(post => post.originalUrl === row.sourceUrl)
    if (found) {
      const content = convertMarkdownToLexical({ editorConfig, markdown: row.markdown })
      if (previousExport && (!isDeepStrictEqual(normalize(found.content), normalize(content)) || !isDeepStrictEqual(found.gallery.map(item=>item.url), row.gallery))) {
        const previous = previousExport.rows.find(item => item.sourceUrl === row.sourceUrl)
        assert.ok(previous, 'Previous source required for guarded refinement')
        assert.deepEqual(normalize(found.content), normalize(convertMarkdownToLexical({ editorConfig, markdown: previous.markdown })), `CMS content edited since import: ${row.title}`)
        assert.deepEqual(found.gallery.map(item=>item.url),previous.gallery, `CMS gallery edited since import: ${row.title}`)
        assert.equal(found.excerpt,previous.excerpt, `CMS excerpt edited since import: ${row.title}`)
        await payload.update({ collection:'posts', id:found.id, context:{disableRevalidate:true}, data:{content,excerpt:row.excerpt,gallery:row.gallery.map(url=>({url}))} })
        report.push({ source:row.sourceUrl,post:found.id,refined:true }); continue
      }
      report.push({ source: row.sourceUrl, post: found.id, skipped: true }); continue
    }
    const path = new URL(row.sourceUrl).pathname.replace('/aktuelles/', '').split('/').join('-')
    let slug = `archiv-${path}`
    if (slugs.has(slug)) slug += `-${createHash('sha256').update(row.sourceUrl).digest('hex').slice(0,8)}`
    assert.ok(!slugs.has(slug)); slugs.add(slug)
    const content = convertMarkdownToLexical({ editorConfig, markdown: row.markdown })
    const post = await payload.create({ collection: 'posts', depth: 0, context: { disableRevalidate: true }, data: {
      title: row.title, slug, slugLock: false, sourceType: 'legacy-news', originalUrl: row.sourceUrl,
      legacyImportedAt: source.exportedAt, legacyDateLabel: row.dateLabel, publishedAt: row.publishedAt, sourceCreatedAt: row.publishedAt,
      content, excerpt: row.excerpt, gallery: row.gallery.map(url => ({ url })),
      tags: row.tags.map(tag => ({ tag })), socialMediaConsent: false,
      _status: 'published', meta: { title: row.title, description: row.excerpt.slice(0,160) },
    } })
    assert.deepEqual(normalize(post.content), normalize(content))
    report.push({ source: row.sourceUrl, post: post.id, slug, media: row.gallery.length })
    console.log(`Imported ${report.length}/${source.rows.length}: ${row.title}`)
  }
  const final = await payload.find({ collection: 'posts', draft: true, pagination: false, depth: 0 })
  for (const row of source.rows) assert.equal(final.docs.filter(post => post.originalUrl === row.sourceUrl).length, 1)
  // The existing showcase records, including their private draft, must remain untouched.
  for (const post of existing.docs.filter(post => post.legacyResourceId)) assert.deepEqual(normalize(final.docs.find(doc => doc.id === post.id)), normalize(post))
  await writeFile('.db-backups/legacy-news-import-report.json', JSON.stringify({ source: source.source, total: report.length, report }, null, 2), { mode: 0o600 })
  console.log(JSON.stringify({ total: report.length, created: report.filter(row => !row.skipped && !row.refined).length, refined:report.filter(row=>row.refined).length, skipped: report.filter(row => row.skipped).length, existingShowcasesUnchanged: true }))
} finally { await payload.db.destroy() }
