import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import { convertMarkdownToLexical, defaultEditorConfig, sanitizeServerEditorConfig } from '@payloadcms/richtext-lexical'
import config from '../src/payload.config.ts'
const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['localhost','127.0.0.1'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local')
const source = JSON.parse(await readFile(process.argv[2], 'utf8'))
let mediaManifest
try { mediaManifest = JSON.parse(await readFile('.db-backups/legacy-news-media/manifest.json', 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
const payload = await getPayload({ config })
try {
  const { docs } = await payload.find({ collection:'posts', draft:true, depth:0, pagination:false })
  const editorConfig = await sanitizeServerEditorConfig(defaultEditorConfig, payload.config)
  const normalize = value => JSON.parse(JSON.stringify(value, (key,item) => key === 'id' ? undefined : item))
  for (const row of source.rows) {
    const matches = docs.filter(post => post.originalUrl === row.sourceUrl)
    assert.equal(matches.length,1,row.sourceUrl)
    const post = matches[0]
    assert.equal(post.title,row.title); assert.equal(post.sourceType,'legacy-news'); assert.equal(post._status,'published')
    assert.equal(Date.parse(post.publishedAt),Date.parse(row.publishedAt)); assert.equal(post.legacyDateLabel,row.dateLabel)
    assert.equal(post.gallery.length,row.gallery.length)
    for (let index=0;index<row.gallery.length;index++) {
      const gallery=post.gallery[index]
      if (gallery.media) {
        assert.equal(gallery.media,mediaManifest?.files[row.gallery[index]]?.mediaId)
        assert.equal(gallery.url,null)
      } else assert.equal(gallery.url,row.gallery[index])
    }
    assert.deepEqual(post.tags.map(item=>item.tag),row.tags)
    assert.deepEqual(normalize(post.content),normalize(convertMarkdownToLexical({editorConfig,markdown:row.markdown})))
    assert.equal(post.socialMediaConsent,false)
  }
  const publicResult=await fetch('http://localhost:3106/api/posts?limit=200&depth=0&where[sourceType][equals]=legacy-news').then(r=>r.json())
  assert.equal(publicResult.totalDocs,source.rows.length)
  assert.equal(docs.filter(post=>post.legacyResourceId).length,58)
  const draft=docs.find(post=>post.legacyResourceId && post._status==='draft')
  assert.ok(draft)
  assert.equal((await fetch(`http://localhost:3106/api/posts/${draft.id}`)).status,404)
  console.log(JSON.stringify({verified:source.rows.length,mediaReferences:source.rows.reduce((n,r)=>n+r.gallery.length,0),publishedLegacyPosts:publicResult.totalDocs,showcases:58,privateShowcaseProtected:true}))
}finally{await payload.db.destroy()}
