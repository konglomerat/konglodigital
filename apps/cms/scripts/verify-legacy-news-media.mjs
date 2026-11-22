import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const source=JSON.parse(await readFile(process.argv[2],'utf8'))
const manifest=JSON.parse(await readFile('.db-backups/legacy-news-media/manifest.json','utf8'))
assert.ok(manifest.completedAt,'Migration must be complete')
const response=await fetch('http://localhost:3106/api/posts?limit=200&depth=1&where[sourceType][equals]=legacy-news')
assert.ok(response.ok)
const result=await response.json()
assert.equal(result.totalDocs,101);assert.equal(result.docs.length,101)
let references=0
const owned=url=>{const u=new URL(url);return u.origin==='https://media.konglomerat.org'||(u.origin==='http://localhost:3106'&&u.pathname.startsWith('/api/media/file/'))}
for(const row of source.rows){
  const post=result.docs.find(post=>post.originalUrl===row.sourceUrl)
  assert.ok(post,row.sourceUrl);assert.equal(post.gallery.length,row.gallery.length)
  for(let i=0;i<row.gallery.length;i++){
    const entry=post.gallery[i],saved=manifest.files[row.gallery[i]]
    assert.equal(entry.media.id,saved.mediaId);assert.equal(entry.media.url,saved.url)
    assert.ok(owned(entry.media.url))
    assert.equal(entry.url,null)
    assert.ok(!entry.previewUrl || owned(entry.previewUrl))
    assert.ok(!entry.posterUrl || owned(entry.posterUrl))
    references++
  }
}
const files=Object.values(manifest.files)
assert.ok(files.every(file=>file.mediaId && file.sha256 && file.bytes>0))
console.log(JSON.stringify({verifiedPosts:result.totalDocs,mediaReferences:references,sourceFiles:files.length,uniqueMediaRecords:new Set(files.map(x=>x.mediaId)).size,bytes:files.reduce((n,f)=>n+f.bytes,0),legacyImageDependencies:0}))
