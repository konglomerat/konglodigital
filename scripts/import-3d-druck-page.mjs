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
const source = JSON.parse(await readFile(path.join(root, 'references/3d-druck/sources.json'), 'utf8'));
const text = value => ({ type:'text', text:value, version:1, format:0, detail:0, mode:'normal', style:'' });
const node = (type,value,tag) => ({ type, version:1, direction:'ltr', format:'', indent:0, ...(tag?{tag}:{}), children:[text(value)] });
const rt = (...parts) => ({root:{type:'root',version:1,direction:'ltr',format:'',indent:0,children:parts.map(p=>Array.isArray(p)?node('heading',p[1],p[0]):node('paragraph',p))}});
const link = (label,url) => ({type:'custom',label,url,appearance:'default'});
const content = (name,...parts) => ({blockType:'content',blockName:name,columns:[{size:'full',richText:rt(...parts),enableLink:false}]});
const mail='mailto:lasern@listen.konglomerat.org';
const context={disableRevalidate:true};
try {
 const pages=await payload.find({collection:'pages',draft:true,depth:0,where:{werkbereich:{equals:'3d-druck'}},limit:2});
 assert.equal(pages.docs.length,1,'Expected exactly one existing 3D-Druck page');
 const original=pages.docs[0];
 if(!process.argv.includes('write')) {console.log({pageId:original.id,title:original.title,status:original._status,assets:source.assets.length});process.exitCode=0;}
 else {
  const backupDir=path.join(process.cwd(),'.db-backups');await mkdir(backupDir,{recursive:true});
  await writeFile(path.join(backupDir,`3d-druck-before-import-${Date.now()}.json`),JSON.stringify(original,null,2),{mode:0o600});
  const media={};
  for(const asset of source.assets){
   const name='3d-druck-reference-'+asset.key+path.extname(new URL(asset.url).pathname);
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
  const sourceLink = fragment => source.links.find(url => url.includes(fragment));
  const cards = (name,items,columnCount='3') => ({blockType:'cardGrid',blockName:name,columnCount,introContent:rt(['h2',name]),cards:items.map(([title,description,url])=>({title,description:rt(description),enableLink:!!url,...(url?{link:link(title,url)}:{})}))});
  const steps = (heading,items) => content(heading,['h2',heading],...items.flatMap(([title,body],index)=>[['h3',`${index+1}. ${title}`],body]));
  const layout=[
   {blockType:'workshopInfo',blockName:'Zugang und offene Werkstatt',heading:'Auf einen Blick',location:'Im Laserbereich',access:'Vereinsmitglieder können nach einer kurzen Einweisung selbstständig drucken. Für andere übernehmen wir nach Absprache und Kapazität Druckaufträge.',hours:'Offene Laser- und 3D-Druckwerkstatt: jeden 2. und 4. Mittwoch, 18–22 Uhr. Bitte den Termin vorher im Kalender prüfen.',costs:'Für Mitgliederdrucke empfehlen wir eine Spende von 2–5 € je 100 g Filament. Druckaufträge werden individuell kalkuliert.'},
   {blockType:'cta',blockName:'Einstieg',richText:rt(['h2','Dein erstes Druckprojekt'],'Komm mit deiner Idee zur offenen Werkstatt. Dort klären wir Einweisung, Material und die nächsten Schritte.'),links:[{link:link('Termine prüfen','/calendar')},{link:link('Einweisung anfragen',mail)}]},
   {blockType:'inventory',blockName:'3D-Drucker aus dem Inventar',heading:'Unsere 3D-Drucker',description:'Fotos und Details zu unseren Druckern findest du direkt im Inventar.',tag:'3ddrucker',columnCount:'3'},
   content('Ältere Drucker abzugeben',['h2','Ältere Drucker suchen ein neues Zuhause'],'Malyan M200, Anycubic Kossel Delta und Creality CR-10 werden auf der bisherigen Werkbereichsseite zur Abgabe gegen Spende beziehungsweise zum Verschenken angeboten. Frage beim Team nach, welche Geräte noch verfügbar sind.'),
   // Keep the existing real tools; no copied live printer or credential data in the CMS.
   ...original.layout.filter(block=>block.blockType==='cardGrid' && (block.cards??[]).some(card=>card.link?.url==='/printers')),
   steps('Selbst drucken – Schritt für Schritt',[
    ['Bambu Studio installieren','Installiere Bambu Studio auf deinem Rechner. Alternativ kannst du die bereits installierte Software auf dem Laserlaptop vor Ort verwenden.'],
    ['Einweisung und Zugang klären','Nach der Einweisung erhalten Vereinsmitglieder die benötigten Zugangsdaten über den Laserverteiler. Dort kannst du auch den Link zur Telegram-Gruppe erfragen. Den internen Self-Service für Zugangscodes findest du oben.'],
    ['Das passende Profil wählen','Für den P1S mit 0,4-mm-Düse wählst du in Bambu Studio „Bambu Lab P1S 0.4 nozzle“. Dieses Profil gilt für den P1S; für andere Geräte das entsprechende Profil verwenden.'],
    ['Filament auswählen','Bei einem Gerät mit AMS zeigt Bambu Studio die aktuell geladenen Filamente. Prüfe Material und Zuordnung vor dem Start. Besondere Materialien vorher mit dem Team absprechen.'],
    ['Druckplatte vor dem Start prüfen','Auf der Druckplatte darf kein fertiger Druck mehr liegen. Den Zustand und laufende Drucke kannst du in Bambu Studio unter „Device“ mit der Webcam prüfen.'],
    ['Fertigen Druck abnehmen','Löst sich der Druck nicht leicht, nimm die Druckplatte heraus und biege sie vorsichtig, um das Teil zu lösen.'],
    ['Druckplatte wieder einsetzen','Setze die Platte korrekt ein und bestätige das Abräumen im Self-Service „Drucker entleeren“. Lass den Drucker eingeschaltet: Er wechselt automatisch in Stand-by.'],
   ]),
   {blockType:'downloads',blockName:'Software und Anleitung',items:[{label:'Bambu Studio herunterladen',url:sourceLink('/download/studio'),description:'Slicer und Druckersteuerung für deinen Rechner.',newTab:true},{label:'Druckplatte richtig einsetzen',url:sourceLink('youtube.com'),description:'Videoanleitung zum korrekten Einsetzen der Platte.',newTab:true}]},
   content('Filament und Material',['h2','Filament und Material'],'Unsere Standardfilamente haben 1,75 mm Durchmesser. Die folgende Übersicht übernimmt den Materialstand der bisherigen Werkbereichsseite. Farben und Restmengen können sich durch Nutzung verändern; die aktuell eingelegten Rollen prüfst du in Bambu Studio.',['h3','PLA und Support'],'Bambu PLA Basic in Grün und Orange sowie Bambu PLA Support. Generic PLA in Schwarz und Hellgrau (1 kg), transparent in Rollen mit etwa 700 g, 300 g und 1 kg. 3DJAKE ecoPLA in Dunkelgrau und Schwarz (je 1 kg). Dazu PLA+ Blau (1 kg), Geeetech PLA Weiß (200 g), eono PLA+ Rot (500 g) und Elegoo PLA+ in Gelb, Orange, Sky Blue und Sea Green (je 1 kg). Außerdem verschiedene Öko-PLA-Varianten.',['h3','PETG, ASA und TPU'],'Bambu PETG HF in Grau (1 kg), dazu Gelb als Refill (33400) sowie Schwarz (33102), Grau (33101) und Rot (33200) auf Spule, jeweils 1 kg. Sunlu PETG in Transparent (200 g) und Mittelgrau (500 g). Bambu ASA in Schwarz (1 kg). Bambu TPU for AMS in Gelb und weitere flexible TPU-Materialien.',['h3','Eigenes und besonderes Material'],'Du kannst eigene Filamente mitbringen. Carbon, TPU und andere besondere Materialien nur nach Absprache einsetzen; nicht ungeprüft mit der verbauten Düse oder dem AMS verwenden. Für andere Drucker gibt es außerdem einige Rollen mit 2,85 mm Durchmesser.'),
   {blockType:'equipment',blockName:'Zubehör und Trocknung',heading:'Zubehör und Filament trocknen',items:[
    {name:'Sovol SH02 Filamenttrockner',description:'Zum Trocknen vieler Filamenttypen. Außerdem kann das AMS 2 am H2D Filament trocknen. Die passende Einstellung mit dem Team abstimmen.'},
    {name:'Messing-Gewindeeinsätze',description:'Einschmelzgewinde in M2, M2,5, M3, M4, M5 und M6.'},
    {name:'Schrauben und Magnete',description:'M3-/M4-Zylinderkopfschrauben sowie vernickelte Neodym-Scheibenmagnete, 10 × 3 mm, Güte N52.'},
   ]},
   {blockType:'cta',blockName:'Mitgliederdrucke',richText:rt(['h2','Was kostet mein Druck als Mitglied?'],'Empfohlen sind 2–5 € Spende pro 100 g Filament, gerne mehr. Bambu Studio zeigt dir den Materialbedarf und eine Kostenschätzung vor dem Druckstart. Spenden helfen bei Material, Wartung und Ausbau der Werkstatt.'),links:[{link:link('Per PayPal spenden',sourceLink('paypal.com'))}]},
   {blockType:'stats',blockName:'Preise für Druckaufträge',introContent:rt(['h2','Kosten für externe Druckaufträge'],'Der Preis setzt sich aus Buildplates, Material und Arbeitszeit zusammen. Stabilität, Hitzebeständigkeit, Farben und Nachbearbeitung beeinflussen den Aufwand. Alle folgenden Preise inklusive Mehrwertsteuer.'),items:[
    {value:'5,00 €',label:'je Buildplate',hint:'Nutzungsgebühr für Verschleiß, Wartung und Strom',tone:'rosa'},
    {value:'20,00 €',label:'je kg PLA',tone:'grau'},
    {value:'23,00 €',label:'je kg PETG',tone:'grau'},
    {value:'45,00 €',label:'je kg TPU',tone:'grau'},
    {value:'30,00 €',label:'je Stunde Arbeitszeit',hint:'Vorbereitung, Überwachung und Nachbearbeitung',tone:'gelb'},
   ]},
   content('Beispielrechnung Kamera-Case',['h2','Beispiel: Kamera-Case mit TPU-Einsatz'],'Das Beispiel kombiniert eine feste Hülle mit einem flexiblen Einsatz. Es benötigt vier Buildplates und 656 g Material; die Druckzeit betrug etwa 36 Stunden. Arbeitszeit und Maschinenlaufzeit sind unterschiedliche Größen.',['h3','So setzt sich der Preis zusammen'],'4 Buildplates × 5,00 € = 20,00 €','265 g PETG × 23,00 €/kg = 6,10 €','391 g TPU × 45,00 €/kg = 17,60 €','1 Stunde Arbeitszeit × 30,00 € = 30,00 €',['h3','Gesamt: 73,70 €'],'Einzelpositionen sind auf Cent gerundet. Dieses Beispiel ist eine Orientierung; dein Auftrag wird nach Material und Aufwand individuell abgestimmt.'),
   {blockType:'gallery',blockName:'Kamera-Case',columnCount:'2',items:[{media:media['case-modell'],caption:'Kamera-Case mit herausnehmbarem TPU-Einsatz: Modellansicht.'},{media:media['case-druck'],caption:'Das gedruckte Kamera-Case.'}]},
   {blockType:'downloads',blockName:'Modell zum Beispiel',items:[{label:'Kamera-Case auf MakerWorld',url:sourceLink('makerworld.com'),description:'Modell mit herausnehmbarem TPU-Einsatz für eine DJI Action 4.',newTab:true}]},
   {blockType:'cta',blockName:'Druckauftrag anfragen',richText:rt(['h2','Drucken lassen'],'Bei freien Kapazitäten übernehmen wir individuelle Aufträge. Schicke uns deine Idee per E-Mail, gerne mit Skizzen, Bildern oder fertigem 3D-Modell. Material, Vorbereitung und Nachbearbeitung besprechen wir vorab.'),links:[{link:link('Druckauftrag anfragen',mail)}]},
   content('Material und Geld spenden',['h2','Du möchtest die Werkstatt unterstützen?'],'Nicht mehr benötigtes 1,75-mm-Filament nehmen wir gerne als Materialspende an. Melde dich beim Team. Geldspenden sind über die Spendendose vor Ort oder per PayPal möglich und unterstützen Material, Wartung und neue Ausstattung.'),
   {blockType:'contact',blockName:'Kontakt',heading:'Kontakt zum 3D-Druck-Team',introContent:rt('Du erreichst uns über den E-Mail-Verteiler des Laserbereichs. Hier klären wir Einweisungen, Zugänge, Materialien und Druckaufträge. Deine Nachricht geht an die Mitglieder des Verteilers.'),email:'lasern@listen.konglomerat.org',links:[{link:link('Zugang & Mitgliedschaft','/monatsbeitrag')},{link:link('Zum Werkbereich Laser','/werkbereiche/laser')}]},
  ];
  assert.ok(layout.some(block=>(block.cards??[]).some(card=>card.link?.url==='/printers')),'Existing printer self-service links must be retained');
  const updated=await payload.update({collection:'pages',id:original.id,context,data:{title:'3D-Druck',werkbereich:'3d-druck',slug:'werkbereich-3d-druck',_status:'published',hero:{type:'highImpact',media:media.werkstatt,richText:rt(['h2','Von deiner Idee zum fertigen Teil.'],'Selbst drucken, Materialien ausprobieren oder ein Projekt mit uns umsetzen.'),links:[{link:link('Einweisung anfragen',mail)}]},meta:{title:'3D-Druck – Geräte, Material und Einstieg im Konglomerat',description:'Drucker, Materialien, Anleitung und Kosten: alles für dein 3D-Druck-Projekt auf einer Seite.'},layout}});
  console.log(JSON.stringify({id:updated.id,slug:updated.slug,status:updated._status,blocks:updated.layout.length,media}));
 }
} finally {await payload.db.destroy();}
