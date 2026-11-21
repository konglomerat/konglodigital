import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {getPayload} from 'payload'
import config from '../src/payload.config.ts'
const db=new URL(process.env.POSTGRES_URL)
const dir='.db-backups/shared-cms-20261122'
const payload=await getPayload({config})
try{
 if(process.argv[2]==='snapshot'){
  const previous=JSON.parse(await readFile('src/migrations/20261121_012000_gallery_media_layout.json','utf8'))
  const snapshot=payload.db.requireDrizzleKit().generateDrizzleJson(payload.db.schema,previous.id)
  await writeFile('src/migrations/20261122_001000_shared_cms_content.json',JSON.stringify(snapshot,null,2)+'\n')
  console.log('Current schema snapshot saved')
 }else if(process.argv[2]==='schema'){
  assert.equal(db.pathname,'/konglo_cms_merge_test_20261122')
  // Only generate a review plan; choose CREATE instead of guessing renames.
  const answers=setInterval(()=>process.stdin.emit('keypress','\n',{name:'return',ctrl:false}),25)
  let plan
  try{plan=await payload.db.requireDrizzleKit().pushSchema(payload.db.schema,payload.db.drizzle)}finally{clearInterval(answers)}
  await writeFile(`${dir}/schema-plan.json`,JSON.stringify({warnings:plan.warnings,hasDataLoss:plan.hasDataLoss,sql:plan.statementsToExecute},null,2),{mode:0o600})
  console.log({statements:plan.statementsToExecute.length,warnings:plan.warnings,hasDataLoss:plan.hasDataLoss})
 }else{
  const data={collections:{},globals:{}}
  for(const collection of ['media','categories','pages','posts','forms','form-submissions','redirects']){
   if(!payload.collections[collection])continue
   data.collections[collection]=(await payload.find({collection,depth:0,draft:true,pagination:false,overrideAccess:true})).docs
  }
  data.users=(await payload.find({collection:'users',depth:0,pagination:false,overrideAccess:true})).docs.map(({id,supabaseId,email,name})=>({id,supabaseId,email,name}))
  for(const slug of ['header','footer'])data.globals[slug]=await payload.findGlobal({slug,depth:0})
  const name=db.pathname==='/konglo_cms_workareas_local'?'local-content':'production-content'
  await writeFile(`${dir}/${name}.json`,JSON.stringify(data,null,2),{mode:0o600})
  console.log({name,collections:Object.fromEntries(Object.entries(data.collections).map(([k,v])=>[k,v.length])),globals:Object.fromEntries(Object.entries(data.globals).map(([k,v])=>[k,v.navItems?.length]))})
 }
}finally{await payload.db.destroy()}
