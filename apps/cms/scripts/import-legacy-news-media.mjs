import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import sharp from 'sharp'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['localhost','127.0.0.1'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local', 'Local migration database required')
assert.ok(process.env.OPENINARY_API_KEY, 'Configured Openinary upload key required')
assert.equal(new URL(process.env.OPENINARY_BASE_URL || 'https://media.konglomerat.org').origin,'https://media.konglomerat.org')
const dir='.db-backups/legacy-news-media'
await mkdir(`${dir}/files`,{recursive:true})
const manifestPath=`${dir}/manifest.json`
let manifest
try{manifest=JSON.parse(await readFile(manifestPath,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;manifest={version:1,files:{}}}
const save=async()=>{await writeFile(`${manifestPath}.tmp`,JSON.stringify(manifest,null,2),{mode:0o600});await rename(`${manifestPath}.tmp`,manifestPath)}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const execFileAsync=promisify(execFile)
const download=async url=>{
  const result=await execFileAsync('curl',['--fail','--silent','--show-error','--retry','3','--retry-all-errors','--connect-timeout','15','--max-time','90','--max-filesize','104857600',url],{encoding:'buffer',maxBuffer:100*1024*1024})
  return result.stdout
}
const fetchWithRetry=async(url,options={})=>{
  for(let attempt=1;attempt<=4;attempt++){
    try{
      const response=await fetch(url,{...options,headers:{Connection:'close'},signal:AbortSignal.timeout(30000)})
      if(response.status>=500||response.status===429){await response.body?.cancel();throw new Error(`HTTP ${response.status}`)}
      return response
    }catch(error){
      if(attempt===4)throw new Error(`Download failed: ${url}`,{cause:error})
      console.warn(`Retry ${attempt}: ${url}`)
      await new Promise(resolve=>setTimeout(resolve,attempt*1000))
    }
  }
}
const types={jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',avif:'image/avif',tiff:'image/tiff',svg:'image/svg+xml'}
const normalize=v=>JSON.parse(JSON.stringify(v,(k,x)=>k==='id'?undefined:x))
const assertOwnedMedia=url=>{
  const parsed=new URL(url)
  assert.ok(parsed.origin==='https://media.konglomerat.org'||(
    parsed.origin===new URL(process.env.NEXT_PUBLIC_SERVER_URL).origin&&parsed.pathname.startsWith('/api/media/file/')
  ),`Unexpected media destination: ${url}`)
}
// Archive migration needs the intact original and an admin thumbnail. Avoid
// generating eight redundant derivatives per photo; the frontend uses originals.
const migrationConfig=await config
const mediaCollection=migrationConfig.collections.find(c=>c.slug==='media')
mediaCollection.upload.imageSizes=mediaCollection.upload.imageSizes.filter(size=>size.name==='thumbnail')
const payload=await getPayload({config:migrationConfig})
const jobsByHash=new Map()
try{
  const {docs:posts}=await payload.find({collection:'posts',where:{sourceType:{equals:'legacy-news'}},pagination:false,depth:0,draft:true})
  assert.equal(posts.length,101,'Expected migrated archive')
  await writeFile(`${dir}/posts-before-${Date.now()}.json`,JSON.stringify(posts,null,2),{mode:0o600})
  const urls=[...new Set(posts.flatMap(p=>(p.gallery||[]).filter(g=>!g.media).flatMap(g=>[g.url,g.previewUrl,g.posterUrl])).filter(Boolean))]
  for(const url of urls){const u=new URL(url);assert.ok(u.protocol==='https:'&&['konglomerat.org','i.ytimg.com'].includes(u.hostname),`Unexpected source: ${u.hostname}`)}
  const sourcePosts=new Map(urls.map(url=>[url,posts.find(p=>p.gallery?.some(g=>g.url===url))]))
  const transfer=async url=>{
    const saved=manifest.files[url]
    if(saved?.mediaId){
      const existing=await payload.findByID({collection:'media',id:saved.mediaId,depth:0})
      assert.equal(existing.filename,saved.filename);assert.equal(existing.url,saved.url)
      return saved
    }
    let bytes
    if(saved?.sha256)bytes=await readFile(`${dir}/files/${saved.sha256}`)
    else{
      // curl negotiates HTTP/2 with the old host, avoiding intermittent stalled
      // Node HTTP/1 connections for larger originals. No redirects are followed.
      bytes=await download(url);assert.ok(bytes.length>0&&bytes.length<100*1024*1024)
    }
    const sha256=hash(bytes)
    const meta=await sharp(bytes,{animated:true}).metadata()
    assert.ok(types[meta.format],`Unsupported format ${meta.format}`)
    const filename=`legacy-news-${sha256}.${meta.format==='jpeg'?'jpg':meta.format}`
    await writeFile(`${dir}/files/${sha256}`,bytes,{mode:0o600})
    manifest.files[url]={sha256,filename,bytes:bytes.length}
    if(!jobsByHash.has(sha256))jobsByHash.set(sha256,(async()=>{
      const found=await payload.find({collection:'media',where:{filename:{equals:filename}},limit:2,depth:0})
      assert.ok(found.docs.length<=1)
      console.log(JSON.stringify({stage:found.docs.length?'reuse':'upload',filename,bytes:bytes.length}))
      const media=found.docs[0]||await payload.create({collection:'media',data:{alt:sourcePosts.get(url)?.title||'Archivbild'},file:{data:bytes,name:filename,mimetype:types[meta.format],size:bytes.length}})
      assertOwnedMedia(media.url)
      console.log(JSON.stringify({stage:'verify',filename}))
      const copied=await download(media.url)
      assert.equal(hash(copied),sha256,`Original bytes changed: ${filename}`)
      await Promise.all(Object.values(media.sizes||{}).filter(x=>x?.url).map(async variant=>{
        assertOwnedMedia(variant.url)
        const check=await fetchWithRetry(variant.url,{method:'HEAD'})
        assert.ok(check.ok,`Thumbnail unavailable: ${check.status}`)
      }))
      return {mediaId:media.id,url:media.url,sha256,filename,bytes:bytes.length}
    })())
    const result=await jobsByHash.get(sha256);manifest.files[url]=result;return result
  }
  const limit=process.argv[2]==='sample'?1:urls.length
  for(let i=0;i<limit;i+=6){
    const results=await Promise.allSettled(urls.slice(i,Math.min(i+6,limit)).map(transfer))
    await save()
    console.log(JSON.stringify({processed:Math.min(i+6,limit),total:urls.length,stored:Object.values(manifest.files).filter(x=>x.mediaId).length}))
    const errors=results.filter(x=>x.status==='rejected');if(errors.length)throw new AggregateError(errors.map(x=>x.reason),'Image transfers failed; progress saved for retry')
  }
  if(process.argv[2]==='sample'){console.log('Sample transfer verified; posts unchanged');process.exitCode=0}
  else{
    let changed=0
    for(const original of posts){
      const latest=await payload.findByID({collection:'posts',id:original.id,depth:0,draft:true})
      assert.deepEqual(normalize(latest.gallery),normalize(original.gallery),`Gallery changed during migration: ${original.id}`)
      const gallery=(original.gallery||[]).map(g=>{
        if(g.media||!g.url)return g
        const item=manifest.files[g.url];assert.ok(item?.mediaId)
        return {...g,media:item.mediaId,url:null,previewUrl:g.previewUrl?manifest.files[g.previewUrl].url:null,posterUrl:g.posterUrl?manifest.files[g.posterUrl].url:null}
      })
      if(!isDeepStrictEqual(gallery,original.gallery)){
        await payload.update({collection:'posts',id:original.id,context:{disableRevalidate:true},data:{gallery}});changed++
      }
    }
    const {docs:verified}=await payload.find({collection:'posts',where:{sourceType:{equals:'legacy-news'}},pagination:false,depth:1,draft:true})
    for(const post of verified){
      for(const g of post.gallery||[]){assert.ok(g.media?.url);assertOwnedMedia(g.media.url);assert.equal(g.url,null)}
      const original=posts.find(p=>p.id===post.id)
      assert.deepEqual(normalize(post.content),normalize(original.content));assert.equal(post._status,original._status)
    }
    manifest.completedAt=new Date().toISOString();await save()
    console.log(JSON.stringify({posts:verified.length,updatedPosts:changed,references:verified.reduce((n,p)=>n+p.gallery.length,0),sourceFiles:Object.keys(manifest.files).length,mediaRecords:new Set(Object.values(manifest.files).map(x=>x.mediaId)).size,originalBytesVerified:true}))
  }
}finally{await payload.db.destroy()}
