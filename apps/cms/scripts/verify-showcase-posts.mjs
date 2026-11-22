import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import { convertMarkdownToLexical, defaultEditorConfig, sanitizeServerEditorConfig } from '@payloadcms/richtext-lexical'
import config from '../src/payload.config.ts'
const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['localhost','127.0.0.1'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local')
const source = JSON.parse(await readFile(process.argv[2], 'utf8'))
const payload = await getPayload({ config })
// Markdown conversion assigns fresh IDs to link nodes on each run.
const normalizeRichText = value => JSON.parse(JSON.stringify(value, (key, item) => key === 'id' ? undefined : item))
try {
  const { docs } = await payload.find({ collection: 'posts', draft: true, pagination: false, depth: 0 })
  const editorConfig = await sanitizeServerEditorConfig(defaultEditorConfig, payload.config)
  let count=0, media=0
  for(const row of source.rows){
    const matches=docs.filter(post=>post.legacyResourceId===row.id)
    assert.equal(matches.length,1)
    const post=matches[0]
    assert.equal(post.title,row.name)
    assert.equal(post.legacySlug,row.pretty_title||null)
    assert.equal(post._status,row.is_private===false?'published':'draft')
    assert.deepEqual(normalizeRichText(post.content),normalizeRichText(convertMarkdownToLexical({editorConfig,markdown:row.description||''})))
    const urls=[...new Set([row.image,...(row.images||[])].filter(Boolean))]
    assert.deepEqual(post.gallery.map(item=>item.url),urls)
    for(const item of post.gallery){assert.equal(item.previewUrl,row.media_previews?.[item.url]||null);assert.equal(item.posterUrl,row.media_posters?.[item.url]||null)}
    assert.deepEqual(post.tags.map(item=>item.tag),row.tags||[])
    assert.equal(post.workshop?.resourceId||null,row.workshop_resource_id||null)
    const linked=[...new Set(source.links.filter(link=>link.resource_a===row.id||link.resource_b===row.id).map(link=>link.resource_a===row.id?link.resource_b:link.resource_a))]
    assert.deepEqual(post.resources.map(item=>item.resourceId),linked)
    assert.equal(post.socialMediaConsent,row.social_media_consent===true)
    assert.equal(post.excerpt,row.excerpt||'')
    count++;media+=urls.length
  }
  const publicResult=await fetch('http://localhost:3106/api/posts?limit=100&depth=0&where[legacyResourceId][exists]=true').then(r=>r.json())
  assert.equal(publicResult.totalDocs,source.rows.filter(row=>row.is_private===false).length)
  const privatePosts=docs.filter(post=>post._status==='draft')
  for(const post of privatePosts){
    assert.ok(!publicResult.docs.some(row=>row.id===post.id))
    const res=await fetch(`http://localhost:3106/api/posts/${post.id}?draft=true`)
    assert.ok([401,403,404].includes(res.status),`Draft exposed: ${res.status}`)
  }
  console.log(JSON.stringify({verified:count,mediaReferences:media,public:publicResult.totalDocs,drafts:privatePosts.length,anonymousDraftAccessBlocked:true}))
}finally{await payload.db.destroy()}
