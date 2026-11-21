import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {getPayload,createLocalReq} from 'payload'
import config from '../src/payload.config.ts'
const dir='.db-backups/shared-cms-20261122'
const source=JSON.parse(await readFile(`${dir}/local-content.json`,'utf8'))
const database=new URL(process.env.POSTGRES_URL).pathname
assert.ok(['/konglo_cms_merge_test_20261122','/konglo_cms'].includes(database))
if(database==='/konglo_cms')assert.equal(process.argv[2],'apply-reviewed-merge')
const payload=await getPayload({config})
const maps={},report={database,created:{},updated:{},preservedGlobals:[],unmappedLocalUsers:[]}
const clean=doc=>Object.fromEntries(Object.entries(doc).filter(([k])=>!['id','updatedAt','createdAt','url','thumbnailURL','populatedAuthors','breadcrumbs'].includes(k)))
const context={disableRevalidate:true,skipCloudStorage:true}
const req=await createLocalReq({context},payload)
req.transactionID=await payload.db.beginTransaction()
let committed=false
function ref(collection,value){
 if(value==null)return value
 const id=typeof value==='object'?value.id:value
 const mapped=maps[collection]?.[id]
 if(mapped===undefined&&collection==='users')return null
 assert.ok(mapped!==undefined,`Missing ${collection} relationship ${id}`)
 return mapped
}
function generic(value){
 if(Array.isArray(value))return value.map(generic)
 if(!value||typeof value!=='object')return value
 if(value.relationTo&&Object.hasOwn(value,'value')&&maps[value.relationTo])return {...value,value:ref(value.relationTo,value.value)}
 return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,generic(v)]))
}
function remap(fields,input){
 const data=structuredClone(input)
 for(const field of fields){
  if(field.type==='tabs'){for(const tab of field.tabs){if(tab.name){if(data[tab.name])data[tab.name]=remap(tab.fields,data[tab.name])}else Object.assign(data,remap(tab.fields,data))}continue}
  if(!field.name){if(field.fields)Object.assign(data,remap(field.fields,data));continue}
  const value=data[field.name];if(value==null)continue
  if(field.type==='relationship'||field.type==='upload'){
   const one=v=>typeof field.relationTo==='string'?ref(field.relationTo,v):{...v,value:ref(v.relationTo,v.value)}
   data[field.name]=field.hasMany?value.map(one).filter(v=>v!==null):one(value)
  }else if(field.type==='array')data[field.name]=value.map(v=>remap(field.fields,v))
  else if(field.type==='group')data[field.name]=remap(field.fields,value)
  else if(field.type==='blocks')data[field.name]=value.map(v=>{const block=field.blocks.find(b=>b.slug===v.blockType);assert.ok(block,`Unknown block ${v.blockType}`);return remap(block.fields,v)})
  else if(field.type==='richText')data[field.name]=generic(value)
 }
 return data
}
try{
 const existingUsers=(await payload.find({collection:'users',req,depth:0,pagination:false})).docs
 maps.users={}
 for(const user of source.users){const match=existingUsers.find(u=>user.supabaseId&&u.supabaseId===user.supabaseId);if(match)maps.users[user.id]=match.id;else report.unmappedLocalUsers.push(user.id)}
 for(const collection of ['media','categories','forms','pages','posts','redirects','form-submissions']){
  if(!source.collections[collection]?.length)continue
  maps[collection]={};report.created[collection]=0;report.updated[collection]=0
  const existing=(await payload.find({collection,req,depth:0,pagination:false,draft:true})).docs
  for(const original of source.collections[collection]){
   const match=existing.find(doc=>collection==='media'?doc.filename===original.filename:original.slug?doc.slug===original.slug:collection==='categories'?doc.title===original.title:doc.id===-1)
   if(match){maps[collection][original.id]=match.id;continue}
   let created
   if(collection==='media'){
    const data=clean(original);data.createdAt=original.createdAt;data.updatedAt=original.updatedAt
    for(const size of Object.values(data.sizes||{})){if(size)delete size.url}
    created=await payload.db.create({collection,req,data})
   }else{
    const data=collection==='categories'?{title:original.title,slug:original.slug}:{title:original.title,slug:original.slug,_status:'draft'}
    created=await payload.create({collection,req,data,draft:true,context,overrideAccess:true})
   }
   maps[collection][original.id]=created.id;report.created[collection]++
  }
 }
 for(const collection of ['categories','forms','pages','posts','redirects','form-submissions']){
  for(const original of source.collections[collection]||[]){
   const data=remap(payload.collections[collection].config.fields,clean(original))
   await payload.update({collection,req,id:maps[collection][original.id],data,context,overrideAccess:true});report.updated[collection]++
  }
 }
 // Empty local globals are unsaved development defaults. Preserve live navigation.
 for(const [slug,original] of Object.entries(source.globals)){
  if(!original.navItems?.length){report.preservedGlobals.push(slug);continue}
  const fields=payload.config.globals.find(g=>g.slug===slug).fields
  await payload.updateGlobal({slug,req,data:remap(fields,clean(original)),context})
 }
 const normalize=value=>JSON.parse(JSON.stringify(value,(key,v)=>['id','updatedAt','createdAt','url','thumbnailURL','populatedAuthors','breadcrumbs'].includes(key)?undefined:v))
 // URLs are meaningful content except for computed Media URLs. Check all page/post fields.
 const normalizeContent=value=>JSON.parse(JSON.stringify(value,(key,v)=>['id','updatedAt','createdAt','populatedAuthors','breadcrumbs'].includes(key)?undefined:v))
 for(const collection of ['pages','posts'])for(const original of source.collections[collection]){
  const actual=await payload.findByID({collection,req,id:maps[collection][original.id],depth:0,draft:true})
  const expected=remap(payload.collections[collection].config.fields,clean(original))
  for(const [key,value] of Object.entries(expected))assert.deepEqual(normalizeContent(actual[key]??null),normalizeContent(value??null),`${collection}/${original.slug}: ${key}`)
 }
 for(const original of source.collections.media){
  const actual=await payload.findByID({collection:'media',req,id:maps.media[original.id],depth:0})
  assert.equal(actual.filename,original.filename);assert.equal(actual.prefix,original.prefix)
  assert.equal(actual.filesize,original.filesize)
 }
 const usersAfter=(await payload.find({collection:'users',req,depth:0,pagination:false})).docs
 assert.deepEqual(usersAfter,existingUsers,'Live users must remain unchanged')
 await payload.db.commitTransaction(req.transactionID);committed=true
 report.verified=true;report.maps=maps
 await writeFile(`${dir}/${database.includes('test')?'test':'production'}-merge-report.json`,JSON.stringify(report,null,2),{mode:0o600})
 console.log(JSON.stringify({...report,maps:undefined}))
}finally{if(!committed)await payload.db.rollbackTransaction(req.transactionID);await payload.db.destroy()}
