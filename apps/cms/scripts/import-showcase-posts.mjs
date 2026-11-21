import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { getPayload } from 'payload'
import { convertMarkdownToLexical, defaultEditorConfig, sanitizeServerEditorConfig } from '@payloadcms/richtext-lexical'
import config from '../src/payload.config.ts'

// Idempotent, additive migration. Never overwrites editorial changes or deletes Supabase originals.
const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['localhost','127.0.0.1'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local', 'Local preview database required')
assert.ok(process.argv[2], 'Pass the export JSON path')
const source = JSON.parse(await readFile(process.argv[2], 'utf8'))
assert.ok(source.rows.length > 0 && source.rows.every(row => row.type.toLowerCase() === 'project'))
assert.equal(new Set(source.rows.map(row => row.id)).size, source.rows.length)
const payload = await getPayload({ config })
try {
  const existing = await payload.find({ collection: 'posts', draft: true, depth: 0, pagination: false })
  await mkdir('.db-backups', { recursive: true })
  await writeFile(`.db-backups/posts-before-showcase-${Date.now()}.json`, JSON.stringify(existing.docs, null, 2), { mode: 0o600 })
  const editorConfig = await sanitizeServerEditorConfig(defaultEditorConfig, payload.config)
  const references = new Map(source.references.map(row => [row.id, row]))
  const resource = id => {
    const row = references.get(id)
    return { resourceId: id, name: row?.name || id, slug: row?.pretty_title || null, imageUrl: row?.image || row?.images?.[0] || null }
  }
  const usedSlugs = new Set(existing.docs.map(post => post.slug))
  const report = []
  for (const row of source.rows) {
    const already = existing.docs.find(post => post.legacyResourceId === row.id)
    if (already) { report.push({ source: row.id, post: already.id, skipped: true }); continue }
    const slug = row.pretty_title || row.id
    assert.ok(!usedSlugs.has(slug), `Slug collision: ${slug}`)
    usedSlugs.add(slug)
    const author = row.author_name?.trim() ? { name: row.author_name.trim() } : source.authors?.[row.owner_id]
    const urls = [...new Set([row.image, ...(row.images || [])].filter(Boolean))]
    const linked = [...new Set(source.links.filter(link => link.resource_a === row.id || link.resource_b === row.id).map(link => link.resource_a === row.id ? link.resource_b : link.resource_a))]
    const content = convertMarkdownToLexical({ editorConfig, markdown: row.description || '' })
    // Keep original source in the backup; the rich text is the single editable body.
    const data = {
      title: row.name, slug, slugLock: false, legacySlug: row.pretty_title || null, legacyResourceId: row.id,
      content, excerpt: row.excerpt || '',
      gallery: urls.map(url => ({ url, previewUrl: row.media_previews?.[url] || null, posterUrl: row.media_posters?.[url] || null })),
      authorName: author?.name || null, authorBio: author?.bio || null, authorAvatarUrl: author?.avatarUrl || null,
      tags: (row.tags || []).map(tag => ({ tag })),
      workshop: row.workshop_resource_id ? resource(row.workshop_resource_id) : {},
      resources: linked.map(resource), projectLinks: (row.project_links || []).filter(link => link.url).map(link => ({ label: link.label || link.url, url: link.url })),
      socialMediaConsent: row.social_media_consent === true, mapFeatures: row.map_features || null,
      publishedAt: row.publish_date ? new Date(row.publish_date).toISOString() : row.created_at,
      sourceCreatedAt: row.created_at, sourceUpdatedAt: row.updated_at,
      _status: row.is_private === false ? 'published' : 'draft',
      meta: { title: row.name, description: row.excerpt || undefined },
    }
    const post = await payload.create({ collection: 'posts', data, draft: data._status === 'draft', depth: 0, context: { disableRevalidate: true } })
    assert.equal(post.legacyResourceId, row.id)
    assert.equal(post.gallery.length, urls.length)
    assert.equal(post._status, data._status)
    assert.deepEqual(post.content, JSON.parse(JSON.stringify(content)))
    report.push({ source: row.id, post: post.id, slug, status: post._status, media: urls.length })
  }
  const final = await payload.find({ collection: 'posts', draft: true, depth: 0, pagination: false })
  for (const row of source.rows) assert.equal(final.docs.filter(post => post.legacyResourceId === row.id).length, 1)
  const digest = createHash('sha256').update(JSON.stringify(source)).digest('hex')
  await writeFile('.db-backups/showcase-posts-report.json', JSON.stringify({ digest, total: report.length, report }, null, 2), { mode: 0o600 })
  console.log(JSON.stringify({ total: report.length, created: report.filter(row => !row.skipped).length, skipped: report.filter(row => row.skipped).length }))
} finally { await payload.db.destroy() }
