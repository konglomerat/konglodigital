import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
import { projects, photoAlts } from './verein-projects-content.mjs'

const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['localhost','127.0.0.1'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local', 'Local preview database required')
const directory = process.argv[2] || '/tmp/konglo-projects'
const assets = JSON.parse(await readFile(path.join(directory, 'assets.json'), 'utf8'))
const payload = await getPayload({ config })
const p = text => ({ type:'paragraph',version:1,direction:'ltr',format:'',indent:0,children:[{type:'text',version:1,text,format:0,detail:0,mode:'normal',style:''}] })
const h = text => ({...p(text),type:'heading',tag:'h2'})
const rt = (...children) => ({root:{type:'root',version:1,direction:'ltr',format:'',indent:0,children}})
const link = (label,url) => ({type:'custom',label,url,appearance:'default'})
// Empty sidebar defaults receive fresh nested IDs on read; compare editorial values.
const editorial = value => JSON.parse(JSON.stringify(value, (key, value) => key === 'id' ? undefined : value))
const content = (heading,text) => ({blockType:'content',blockName:heading,columns:[{size:'full',richText:rt(h(heading),p(text)),enableLink:false}]})
try {
  const {docs:before} = await payload.find({collection:'pages',draft:true,depth:0,limit:100})
  const slugs = projects.map(x => `werkbereich-${x.slug}`)
  await mkdir('.db-backups',{recursive:true})
  await writeFile(`.db-backups/projects-before-content-${Date.now()}.json`,JSON.stringify(before,null,2),{mode:0o600})
  const media = {}
  for (const [key,alt] of Object.entries(photoAlts)) {
    const asset = assets.find(x => x.key === key)
    assert.ok(asset,key)
    assert.equal(path.basename(asset.file),asset.file)
    const {docs} = await payload.find({collection:'media',where:{filename:{equals:asset.file}},depth:0,limit:2})
    assert.ok(docs.length<2)
    const saved = docs[0] || await payload.create({collection:'media',filePath:path.join(directory,asset.file),data:{alt}})
    media[key] = saved.id
    console.log(`Photo ${key}: ${saved.id}`)
  }
  const result = []
  for (const project of projects) {
    const slug = `werkbereich-${project.slug}`
    const matches = before.filter(x => [slug,project.slug,`werkbereiche-${project.slug}`].includes(x.slug))
    assert.ok(matches.length<=1,slug)
    const layout = [
      {blockType:'mediaBlock',blockName:'Großes Einstiegsbild',media:media[project.photo]},
      content(...project.intro),
      {blockType:'cta',blockName:project.cta[0],richText:rt(h(project.cta[0]),p(project.cta[1])),links:[{link:link(project.cta[2],project.cta[3])}]},
      {blockType:'cardGrid',blockName:project.cardsHeading,columnCount:'3',introContent:rt(h(project.cardsHeading)),cards:project.cards.map(card=>({title:card.title,description:rt(p(card.text)),media:card.photo?media[card.photo]:null,enableLink:Boolean(card.url),...(card.url?{link:link(card.title,card.url)}:{})}))},
      ...(project.extra?[content(...project.extra)]:[]),
      {blockType:'accordion',blockName:'Fragen zum Einstieg',heading:'Gut zu wissen',items:project.faqs.map(([title,text])=>({title,content:rt(p(text))}))},
      {blockType:'cardGrid',blockName:'Weiterführende Informationen',columnCount:'2',introContent:rt(h('Mehr erfahren')),cards:project.links.map(([title,url])=>({title,enableLink:true,link:link(title,url)}))},
      ...(project.gallery?[{blockType:'gallery',blockName:'Einblicke',introContent:rt(h('Einblicke')),columnCount:'2',items:project.gallery.map(item=>({media:media[item.photo],width:project.gallery.length===1?'full':'half',caption:item.caption}))}]:[]),
    ]
    const sidebarLayout = [
      {blockType:'contact',blockName:'Ort',heading:project.slug==='forum'?'Vor Ort':'Ort',address:project.address},
      {blockType:'contact',blockName:'Kontakt',heading:'Kontakt',email:project.email,...(project.phone?{phone:project.phone}:{})},
      ...(project.calendar===false?[]:[{blockType:'appSlot',blockName:'Aktuelle Termine',slot:'calendarUpcoming'}]),
    ]
    const data = {title:project.title,slug,hero:{type:'none',media:media[project.photo],richText:null,links:[]},layout,sidebarLayout,meta:{title:`${project.title} – Konglomerat`,description:project.summary,image:media[project.photo]},_status:'published'}
    const saved = matches[0]
      ? await payload.update({collection:'pages',id:matches[0].id,data,depth:0,context:{disableRevalidate:true}})
      : await payload.create({collection:'pages',data,depth:0,context:{disableRevalidate:true}})
    assert.equal(saved.slug,slug)
    assert.equal(saved.hero.type,'none')
    assert.equal(saved.layout[0].blockType,'mediaBlock')
    if(project.slug==='vhc') assert.ok(JSON.stringify(saved.layout).includes('/volkshaus/buchen'))
    result.push({slug,id:saved.id,blocks:saved.layout.length})
    console.log(`Saved ${slug}`)
  }
  for(const original of before.filter(x=>!slugs.includes(x.slug))){
    const after = await payload.findByID({collection:'pages',id:original.id,depth:0,draft:true})
    assert.deepEqual(editorial(after.layout),editorial(original.layout))
    assert.deepEqual(editorial(after.hero),editorial(original.hero))
    assert.deepEqual(editorial(after.sidebarLayout),editorial(original.sidebarLayout))
  }
  await writeFile(path.join(directory,'import-results.json'),JSON.stringify(result,null,2))
  console.log(JSON.stringify(result))
} finally {await payload.db.destroy()}
