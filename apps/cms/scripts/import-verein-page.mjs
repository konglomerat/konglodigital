import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

// Editorial sources: konglomerat.org/der-verein/{ueber-uns,rosenwerk,
// mitglied-werden,freunde-und-foerderer} and konglomerat.org/kontakt.
// Local preview only. Original photos and their source URLs: assets.json.
const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['localhost','127.0.0.1'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local', 'Local preview database required')
const directory = process.argv[2] || '/tmp/konglo-verein'
const assets = JSON.parse(await readFile(path.join(directory,'assets.json'),'utf8'))
const p = text => ({type:'paragraph',version:1,direction:'ltr',format:'',indent:0,children:[{type:'text',version:1,text,format:0,detail:0,mode:'normal',style:''}]})
const h = text => ({...p(text),type:'heading',tag:'h2'})
const rt = (...children) => ({root:{type:'root',version:1,direction:'ltr',format:'',indent:0,children}})
const link = (label,url) => ({type:'custom',label,url,appearance:'default'})
const content = (heading,...texts) => ({blockType:'content',blockName:heading,columns:[{size:'full',richText:rt(h(heading),...texts.map(p)),enableLink:false}]})
const card = (title,text,url,media) => ({title,description:rt(p(text)),enableLink:Boolean(url),...(url?{link:link(title,url)}:{}),...(media?{media}:{})})
const editorial = value => JSON.parse(JSON.stringify(value,(key,val)=>key==='id'?undefined:val))
const payload = await getPayload({config})
try {
  const {docs:before} = await payload.find({collection:'pages',draft:true,depth:0,limit:100})
  const matches = before.filter(x=>['verein','ueber-uns'].includes(x.slug))
  assert.ok(matches.length<=1,'Ambiguous Vereinsseite')
  await mkdir('.db-backups',{recursive:true})
  await writeFile(`.db-backups/verein-before-content-${Date.now()}.json`,JSON.stringify(before,null,2),{mode:0o600})
  const media = {}
  for(const asset of assets){
    assert.equal(path.basename(asset.file),asset.file)
    const {docs} = await payload.find({collection:'media',where:{filename:{equals:asset.file}},depth:0,limit:2})
    assert.ok(docs.length<2)
    media[asset.key] = (docs[0] || await payload.create({collection:'media',filePath:path.join(directory,asset.file),data:{alt:asset.alt}})).id
  }
  for(const [key,file] of Object.entries({forum:'project-forum-5.jpg',aenderei:'project-aenderei-9.jpg',vhc:'project-rooms-3.jpg'})){
    const {docs} = await payload.find({collection:'media',where:{filename:{equals:file}},depth:0,limit:2})
    assert.equal(docs.length,1,`Required project photo: ${file}`)
    media[key]=docs[0].id
  }
  const layout = [
    {blockType:'mediaBlock',blockName:'Menschen im Rosenwerk',media:media.hero},
    content('Zusammen mehr möglich machen.',
      'Im Konglomerat teilen wir Werkzeuge, Räume und Wissen. Wir bauen, reparieren, experimentieren und unterstützen Menschen dabei, eigene Ideen umzusetzen. Der Verein verbindet Handwerk, Kunst, Kultur und gemeinschaftliches Engagement in Dresden.',
      'Unser gemeinsamer Werkstattort ist das Rosenwerk am Jagdweg. Seit 2015 betreiben wir hier rund 800 Quadratmeter offene Werkstätten – ehrenamtlich und selbstorganisiert. Dazu kommen Projekte und Räume, die Begegnung und gemeinsames Gestalten auch außerhalb der Werkstatt ermöglichen.'),
    {blockType:'cardGrid',blockName:'Mitmachen',columnCount:'3',introContent:rt(h('Dein Platz im Konglomerat.')),cards:[
      card('Erst einmal kennenlernen','Besuche eine offene Werkstatt oder eine Veranstaltung. Auf den Werkbereichsseiten findest du Kontakte, Angebote und den Weg zur Einweisung.','/werkbereiche'),
      card('Mitglied werden','Du möchtest regelmäßig dabei sein und den Verein mittragen? Hier geht es zum Mitgliedsantrag. Beiträge und Werkstattnutzung findest du auf der Tarifseite.','/registration'),
      card('Zeit und Ideen einbringen','Hilf in einem Werkbereich mit, teile dein Wissen oder bring ein eigenes Projekt ein. Schreib uns, was du gern machen möchtest.','mailto:vorstand@konglomerat.org'),
    ]},
    {blockType:'gallery',blockName:'Gemeinsam lernen und arbeiten',columnCount:'2',items:[
      {media:media.austausch,width:'half',caption:'Wissen teilen und voneinander lernen.'},
      {media:media.werkstatt,width:'half',caption:'Werkzeuge nutzen und eigene Vorhaben umsetzen.'},
    ]},
    {blockType:'cardGrid',blockName:'Unsere Orte und Projekte',columnCount:'2',introContent:rt(h('Viele Orte. Ein gemeinsamer Gedanke.'),p('Wir schaffen Raum zum Selbermachen, für Kultur und für Begegnung in der Nachbarschaft.')),cards:[
      card('Rosenwerk','Unser Werkstattverbund am Jagdweg: Maschinen, Materialien und Menschen für kleine Versuche und große Vorhaben.','/werkbereiche',media.werkstatt),
      card('FOR:UM','Ein mobiles Forum für den öffentlichen Raum. Gemeinsam diskutieren, Stadt gestalten und neue Formen des Miteinanders ausprobieren.','/werkbereiche/forum',media.forum),
      card('Änderei','Ein selbstorganisierter Raum in Altlöbtau für Kunst, Austausch und gemeinsame Aktivitäten.','/werkbereiche/aenderei',media.aenderei),
      card('VHC','Kultur und Nachbarschaft im Neuen Volkshaus Cotta – mit Räumen für Treffen, Veranstaltungen und eigene Projekte.','/werkbereiche/vhc',media.vhc),
    ]},
    content('Teilen, reparieren, weiterdenken.',
      'Nicht jedes Werkzeug muss in jedem Haushalt liegen. Gemeinsam können wir Ausstattung nutzen, Materialien weiterverwenden und Dinge reparieren. Beim Ausprobieren wächst das Wissen, wie etwas funktioniert – und wie wir es selbst verändern können.',
      'Wir sind Teil des Verbunds Offener Werkstätten und arbeiten mit Initiativen aus Kultur, Nachbarschaft und Materialkreisläufen zusammen. So werden aus einzelnen Ideen gemeinsame Vorhaben.'),
    {blockType:'cta',blockName:'Verein unterstützen',richText:rt(h('Hilf mit, diese Räume zu erhalten.'),p('Offene Werkstätten brauchen Menschen, die sie tragen: mit Zeit, Wissen oder finanzieller Unterstützung. Wenn du fördern, spenden oder mit uns zusammenarbeiten möchtest, melde dich beim Vorstand.')),links:[{link:link('Unterstützung anbieten','mailto:vorstand@konglomerat.org')},{link:link('Beiträge & Tarife','/tarife')}]},
    {blockType:'accordion',blockName:'Fragen zum Verein',heading:'Gut zu wissen',items:[
      ['Muss ich Mitglied sein, um mitzumachen?','Du kannst den Verein bei offenen Werkstattterminen und Veranstaltungen kennenlernen. Werkstattnutzung ist auch ohne Mitgliedschaft möglich; dafür gelten die jeweiligen Tarife und Zugangsregeln. Frag vor deinem ersten Besuch beim passenden Werkbereich nach.'],
      ['Brauche ich Vorkenntnisse?','Du musst nicht schon alles können. Welche Einweisung du für eine Maschine oder Tätigkeit brauchst, klärst du mit dem jeweiligen Werkbereich. Dort erfährst du auch, welche Kurse und begleiteten Termine angeboten werden.'],
      ['Wie organisiert sich der Verein?','Das Rosenwerk wird ehrenamtlich und gemeinschaftlich betrieben. Mitglieder übernehmen Aufgaben in den Werkbereichen und im Verein. Wenn du Verantwortung übernehmen oder eine Idee einbringen möchtest, sprich uns an. Die formalen Grundlagen findest du in den Vereinsdokumenten.'],
      ['Kann ich mit einer Gruppe oder Initiative mitmachen?','Ja, auch gemeinsame Projekte und Gruppenmitgliedschaften sind möglich. Schreib dem Vorstand, wer ihr seid und was ihr vorhabt. Gemeinsam klären wir, welche Räume, Werkbereiche und Form der Zusammenarbeit passen.'],
      ['Sind die Räume barrierefrei erreichbar?','Zugänge und Arbeitsplätze unterscheiden sich je nach Standort und Werkbereich. Melde dich vorab, wenn du Informationen zum Zugang oder Unterstützung bei deinem Besuch brauchst.'],
    ].map(([title,text])=>({title,content:rt(p(text))}))},
    {blockType:'downloads',blockName:'Vereinsdokumente',introContent:rt(h('So ist der Verein organisiert.')),items:[
      {label:'Vereinssatzung',description:'Zweck, Mitgliedschaft und Organe des Vereins.',url:'/dokumente/satzung.pdf',newTab:true},
      {label:'Beitragsordnung',description:'Regelungen zu den Mitgliedsbeiträgen.',url:'/dokumente/beitragsordnung.pdf',newTab:true},
      {label:'Geschäftsordnung',description:'Grundlagen der Zusammenarbeit im Verein.',url:'/dokumente/geschaeftsordnung.pdf',newTab:true},
    ]},
    {blockType:'contact',blockName:'Kontakt zum Verein',heading:'Sprich uns an.',introContent:rt(p('Für Fragen zum Verein, Mitgliedschaft, Kooperationen oder eigene Ideen erreichst du den Vorstand am besten per E-Mail. Für Maschinen und Einweisungen wende dich direkt an den jeweiligen Werkbereich.')),address:'Konglomerat e.V. · Rosenwerk\nJagdweg 1–3\n01159 Dresden',email:'vorstand@konglomerat.org',links:[{link:link('Werkbereiche & Kontakte','/werkbereiche')}]},
    {blockType:'appSlot',blockName:'Aktuelle Termine im Konglomerat',slot:'calendarUpcoming'},
  ]
  const data={title:'Konglomerat e.V.',slug:'verein',hero:{type:'none',media:media.hero,richText:null,links:[]},layout,sidebarLayout:[],meta:{title:'Der Verein – Konglomerat e.V.',description:'Werkzeuge teilen. Wissen weitergeben. Gemeinsam etwas bewegen.',image:media.hero},_status:'published'}
  const saved=matches[0]
    ? await payload.update({collection:'pages',id:matches[0].id,data,depth:0,context:{disableRevalidate:true}})
    : await payload.create({collection:'pages',data,depth:0,context:{disableRevalidate:true}})
  assert.equal(saved.layout[0].blockType,'mediaBlock')
  assert.equal(saved.layout.filter(b=>b.blockType==='appSlot'&&b.slot==='calendarUpcoming').length,1)
  for(const original of before.filter(x=>x.id!==saved.id)){
    const after=await payload.findByID({collection:'pages',id:original.id,depth:0,draft:true})
    for(const key of ['title','hero','layout','sidebarLayout','meta','_status']) assert.deepEqual(editorial(after[key]),editorial(original[key]),`${original.slug}: ${key}`)
  }
  console.log(JSON.stringify({id:saved.id,slug:saved.slug,blocks:saved.layout.length,media,otherPagesUnchanged:true}))
} finally { await payload.db.destroy() }
