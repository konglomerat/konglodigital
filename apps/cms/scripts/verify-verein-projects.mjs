import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {getPayload} from 'payload'
import config from '../src/payload.config.ts'
import {projects} from './verein-projects-content.mjs'
const db=new URL(process.env.POSTGRES_URL)
assert.ok(['localhost','127.0.0.1'].includes(db.hostname)&&db.pathname==='/konglo_cms_workareas_local')
assert.ok(process.argv[2]?.startsWith('.db-backups/projects-before-content-'),'Pass the pre-import backup')
const before=JSON.parse(await readFile(process.argv[2],'utf8'))
const editorial=x=>JSON.parse(JSON.stringify(x,(k,v)=>k==='id'?undefined:v))
const payload=await getPayload({config})
try {
 const {docs}=await payload.find({collection:'pages',draft:true,depth:0,limit:100})
 const targetSlugs=projects.map(p=>'werkbereich-'+p.slug)
 for(const original of before.filter(p=>!targetSlugs.includes(p.slug))){
  const after=docs.find(p=>p.id===original.id)
  for(const key of ['title','hero','layout','sidebarLayout','meta','_status'])assert.deepEqual(editorial(after[key]),editorial(original[key]),`${original.slug}.${key}`)
 }
 const report=projects.map(project=>{const matches=docs.filter(p=>p.slug==='werkbereich-'+project.slug);assert.equal(matches.length,1);const p=matches[0];assert.equal(p._status,'published');assert.equal(p.hero.type,'none');assert.equal(p.layout[0].blockType,'mediaBlock');assert.ok(JSON.stringify(p.layout).includes(project.cta[3]));return {slug:project.slug,id:p.id,blocks:p.layout.length}})
 await writeFile('/tmp/konglo-projects/import-results.json',JSON.stringify(report,null,2))
 console.log(JSON.stringify({projects:report,otherPagesUnchanged:true}))
}finally{await payload.db.destroy()}
