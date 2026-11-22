import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['127.0.0.1','localhost'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local')
const payload = await getPayload({ config })
try {
 const { docs } = await payload.find({collection:'pages',draft:true,depth:0,limit:2,where:{werkbereich:{equals:'3d-druck'}}})
 assert.equal(docs.length,1)
 const page=docs[0]
 await mkdir('.db-backups',{recursive:true})
 await writeFile(`.db-backups/3d-inventory-before-${Date.now()}.json`,JSON.stringify(page,null,2),{mode:0o600})
 const block={blockType:'inventory',blockName:'3D-Drucker aus dem Inventar',heading:'Unsere 3D-Drucker',description:'Fotos und Details zu unseren Druckern findest du direkt im Inventar.',tag:'3ddrucker',columnCount:'3'}
 let replaced=false
 const layout=page.layout.map(entry=>{
  if ((entry.blockType==='cardGrid' && entry.blockName==='Unsere 3D-Drucker') || (entry.blockType==='inventory' && entry.tag==='3ddrucker')) {replaced=true;return block}
  return entry
 })
 assert.ok(replaced,'Expected printer section')
 const saved=await payload.update({collection:'pages',id:page.id,context:{disableRevalidate:true},data:{layout,_status:'published'}})
 console.log({id:saved.id,blocks:saved.layout.length,inventory:saved.layout.filter(b=>b.blockType==='inventory')})
} finally {await payload.db.destroy()}
