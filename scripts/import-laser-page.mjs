/** Run from ../konglo using the Payload CLI and its local development env. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid');
assert.ok(['localhost', '127.0.0.1'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local', 'Only the local CMS database is allowed');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireBackend = createRequire(path.join(process.cwd(), 'package.json'));
const { getPayload } = await import(pathToFileURL(requireBackend.resolve('payload')));
const { default: config } = await import(pathToFileURL(path.join(process.cwd(), 'src/payload.config.ts')));
const localConfig = await config;
// The migration deliberately stores media on this local CMS, not in cloud storage.
localConfig.collections.find(collection => collection.slug === 'media').upload.disableLocalStorage = false;
const payload = await getPayload({ config: localConfig });
const source = JSON.parse(await readFile(path.join(root, 'references/laser/sources.json'), 'utf8'));
const text = value => ({ type:'text', text:value, version:1, format:0, detail:0, mode:'normal', style:'' });
const node = (type,value,tag) => ({ type, version:1, direction:'ltr', format:'', indent:0, ...(tag?{tag}:{}), children:[text(value)] });
const rt = (...parts) => ({root:{type:'root',version:1,direction:'ltr',format:'',indent:0,children:parts.map(p=>Array.isArray(p)?node('heading',p[1],p[0]):node('paragraph',p))}});
const link = (label,url) => ({type:'custom',label,url,appearance:'default'});
const content = (name,...parts) => ({blockType:'content',blockName:name,columns:[{size:'full',richText:rt(...parts),enableLink:false}]});
const mail='mailto:lasern@listen.konglomerat.org';
const context={disableRevalidate:true};
try {
 const pages=await payload.find({collection:'pages',draft:true,depth:0,where:{werkbereich:{equals:'laser'}},limit:2});
 assert.equal(pages.docs.length,1,'Expected exactly one existing Laser page');
 const original=pages.docs[0];
 if(!process.argv.includes('write')) {console.log({pageId:original.id,title:original.title,status:original._status,assets:source.assets.length});process.exitCode=0;}
 else {
  const backupDir=path.join(process.cwd(),'.db-backups');await mkdir(backupDir,{recursive:true});
  await writeFile(path.join(backupDir,`laser-before-import-${Date.now()}.json`),JSON.stringify(original,null,2),{mode:0o600});
  const media={};
  for(const asset of source.assets){
   const name='laser-reference-'+asset.key+path.extname(new URL(asset.url).pathname);
   const existing=await payload.find({collection:'media',where:{alt:{equals:asset.alt}},limit:1,depth:0});
   if(existing.docs.length){
    try {await access(path.join(process.cwd(),'public/media',existing.docs[0].filename));media[asset.key]=existing.docs[0].id;continue;} catch {}
   }
   const response=await fetch(asset.url);assert.ok(response.ok,`Cannot fetch ${asset.key}`);
   const data=Buffer.from(await response.arrayBuffer());
   const operation={collection:'media',context:{...context,skipCloudStorage:true},data:{alt:asset.alt,prefix:''},file:{data,name,mimetype:response.headers.get('content-type').split(';')[0],size:data.length}};
   const doc=existing.docs.length ? await payload.update({...operation,id:existing.docs[0].id}) : await payload.create(operation);
   media[asset.key]=doc.id;
  }
  const layout=[
   {blockType:'workshopInfo',blockName:'Zugang, Zeiten und Einweisung',heading:'Auf einen Blick',access:'Eigenständig lasern nach Einweisung am jeweiligen Gerät.',hours:'Jeden 2. und 4. Mittwoch, 18–22 Uhr: offene Laser- und 3D-Druckwerkstatt. Bitte vorher im Kalender prüfen, ob der Termin stattfindet.',costs:'Einweisung: 20 € für Vereinsmitglieder, 30 € für alle anderen. Die Lasernutzung wird nach Dauer abgerechnet.'},
   {blockType:'cta',blockName:'Offene Werkstatt',richText:rt(['h2','Komm zur offenen Werkstatt'],'Lerne die Werkstatt kennen, stelle Fragen und besprich dein Vorhaben mit uns.'),links:[{link:link('Termine prüfen','/calendar')},{link:link('Einweisung anfragen',mail)}]},
   content('Selbst lasern',['h2','Selbst lasern: deine Lizenz zum Lasern'],['h3','Zing: Einstieg in etwa zwei Stunden'],'Der Zing lässt sich ähnlich wie ein Computerdrucker bedienen. Bei der Einweisung lernst du Bedienung und wichtige Handgriffe. Einführungen sind zur offenen Werkstatt oder nach Vereinbarung per E-Mail möglich. Der Zing ist nach dem Röhrentausch wieder einsatzbereit.',['h3','Lasersaur: gemeinsam einarbeiten'],'Für den großen DIT-Laser planst du zwei bis drei Abende ein. Gemeinsam setzen wir erste Projekte um und lernen Schalter, Einstellungen und Arbeitsweise kennen. Danach startest du mit Unterstützung dein eigenes Projekt. Melde dich beim Laserverteiler, wenn du einsteigen möchtest.'),
   {blockType:'cardGrid',blockName:'Drei Lasercutter',columnCount:'3',introContent:rt(['h2','Ausstattung'],'Vom mobilen Gravieren bis zum großformatigen Schneiden.'),cards:[
    {title:'Laserpecker 2',eyebrow:'Klein & mobil',media:media.laserpecker,description:rt('5 W · Arbeitsfläche 10 × 10 cm','Für feine Gravuren; Laserpunkt etwa 0,05 × 0,05 mm. Horizontal und vertikal einsetzbar, mit Walzenmodul erweiterbar. Angegebene Schnitttiefe: 2–3 mm, hauptsächlich für Gravuren geeignet.'),enableLink:false},
    {title:'Zing 24',eyebrow:'Vielseitiger Einstieg',media:media.zing,description:rt('30 W · Arbeitsfläche 609 × 304 mm','Zum Gravieren und Schneiden. Welche Materialstärke möglich ist, klärst du vorab mit dem Team am konkreten Material. Neopren und PVC sind ausgeschlossen; Metalle werden nicht geschnitten.'),enableLink:false},
    {title:'Lasersaur',eyebrow:'Groß & leistungsstark',media:media.lasersaur,description:rt('100 W · Arbeitsfläche 1.200 × 600 mm','Unser Do-It-Together-Laserschneider: viel Leistung und große Fläche. Größerer Laserpunkt, beim Gravieren langsamer als die anderen Geräte. Angegebene Schnitttiefe bis zu 25 mm, abhängig vom Material.'),enableLink:false},
   ]},
   content('Kosten',['h2','Was kostet das Lasern?'],'Der Minutenpreis verändert sich mit der Nutzungsdauer. Die beiden Grafiken zeigen Minutenpreis und Gesamtkosten. Der interaktive Kostenrechner wird auf der bisherigen Webseite überarbeitet; bis dahin dienen die Grafiken als Orientierung.'),
   {blockType:'mediaBlock',blockName:'Minutenpreis',media:media.price},
   {blockType:'mediaBlock',blockName:'Gesamtkosten',media:media.cost},
   {blockType:'cta',blockName:'Laserlogbuch und Abrechnung',richText:rt(['h2','Nach dem Lasern abrechnen'],'Trage jede Nutzung direkt anschließend ins Laserlogbuch ein – auch wenn du für andere gelasert hast. Das Formular dient der Kostenabrechnung und Rechnungserstellung.'),links:[{link:link('Laserlogbuch öffnen','https://docs.google.com/forms/d/e/1FAIpQLSd3ap9AQk5a-T4QQLQi56WY3DoOc5Dw4VnhXKcLIUjaWOT1YA/viewform')}]},
   content('Dateivorbereitung',['h2','Dateien vorbereiten'],'Lege Schnittkonturen als Vektoren an, möglichst als Linien statt Flächen. SVG-Dateien, die Inkscape öffnen kann, eignen sich gut.',['h3','Arbeitsschritte durch Farben trennen'],'Nutze unterschiedliche Farben für Schneiden, Gravieren und Markieren. Die konkrete Farbe ist frei wählbar; am Laser ordnen wir die Schritte zu. Eine eigene Farbe für die Außenkontur ermöglicht, diese zuletzt zu schneiden. So verrutscht das Teil nicht vorzeitig.',['h3','Stege erhalten Innenteile'],'Abgetrennte Innenflächen fallen heraus, etwa die Innenformen eines B oder Details eines Motivs. Verbinde sie mit kleinen Stegen oder verwende eine Schablonenschrift.'),
   content('Material und häufige Fragen',['h2','Welche Materialien eignen sich?'],'CO₂-Laser bearbeiten unter anderem Sperrholz, MDF, Papier, Karton, PMMA/Acryl, Leder, Stoff und Kork. Transparentes Acryl ist ebenfalls möglich. Pappelsperrholz lässt sich leichter bearbeiten als Seekiefer.',['h3','Pappe auswählen'],'Graupappe ist wegen Klebstoffen, Rauch und unsauberen Schnittkanten nur bedingt geeignet. Bessere Alternativen: Zeichenkarton, Finnpappe oder Zellstoff-Graukarton.',['h3','Was ist ausgeschlossen?'],'Metall lässt sich nicht schneiden; manche beschichteten oder eloxierten Metalle lassen sich gravieren. Chlorhaltige Kunststoffe wie PVC dürfen wegen giftiger Gase und Geräteschäden nicht gelasert werden.',['h3','Leder gravieren?'],'Echtleder eignet sich. Kunstleder kann PVC enthalten: Zusammensetzung vorher prüfen und unbekannte Materialien mit dem Team absprechen.'),
   {blockType:'downloads',blockName:'Materialübersicht',items:[{label:'Externe Materialtabelle',url:'https://hci.rwth-aachen.de/lasercutter-old',description:'Ergänzende Übersicht der RWTH Aachen.',newTab:true}]},
   {blockType:'cardGrid',blockName:'Lasern lassen und Ausleihe',columnCount:'2',cards:[
    {title:'Lasern lassen',description:rt('Du brauchst ein gelasertes Teil, hast aber keine Zeit für eine Einweisung? Frage im Verteiler nach. Aus der Werkstattgemeinschaft findet sich möglicherweise jemand, der dein Vorhaben übernimmt.'),enableLink:true,link:link('Projekt anfragen',mail)},
    {title:'Laser ausleihen',description:rt('Der Zing ist transportabel – zum Beispiel für Workshops, Festivals, Geburtstage oder Firmenveranstaltungen. Kosten und Bedingungen vereinbaren wir auf Anfrage.'),enableLink:true,link:link('Ausleihe anfragen',mail)}
   ]},
   {blockType:'contact',blockName:'Kontakt',heading:'Fragen? Schreib dem Laserteam.',introContent:rt('Über den Laserverteiler erreichst du die Werkstattgemeinschaft. Deine Nachricht geht an alle im Verteiler.'),email:'lasern@listen.konglomerat.org',links:[{link:link('Zugang & Mitgliedschaft','/monatsbeitrag')},{link:link('Zum Werkbereich 3D-Druck','/werkbereiche/3d-druck')}]},
  ];
  const updated=await payload.update({collection:'pages',id:original.id,context,data:{title:'Laser',werkbereich:'laser',slug:'werkbereich-laser',_status:'published',hero:{type:'highImpact',media:media.zing,richText:rt(['h2','Schneiden. Gravieren. Selber machen.'],'Drei Lasercutter, gemeinsame Einweisungen und Platz für deine Ideen.'),links:[{link:link('Einweisung anfragen',mail)}]},meta:{title:'Laser – Schneiden und Gravieren im Konglomerat',description:'Einweisung, Lasercutter, Materialien und Kosten: alles für dein Laserprojekt an einem Ort.'},layout}});
  console.log(JSON.stringify({id:updated.id,slug:updated.slug,status:updated._status,blocks:updated.layout.length,media}));
 }
} finally {await payload.db.destroy();}
