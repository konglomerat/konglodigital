import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

// Deliberately limited to the local workarea preview database.
const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['localhost', '127.0.0.1'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local')
const directory = process.argv[2] || '/tmp/konglo-wood-laser'
const assets = JSON.parse(await readFile(path.join(directory, 'assets.json'), 'utf8'))
const payload = await getPayload({ config })
const node = text => ({ type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' })
const paragraph = text => ({ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [node(text)] })
const heading = text => ({ ...paragraph(text), type: 'heading', tag: 'h2' })
const rt = (...children) => ({ root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children } })
const link = (label, url) => ({ type: 'custom', label, url, appearance: 'default' })
const content = (blockName, ...children) => ({ blockType: 'content', blockName, columns: [{ size: 'full', richText: rt(...children), enableLink: false }] })
const gallery = (blockName, description, items) => ({ blockType: 'gallery', blockName, introContent: rt(heading('Einblicke in die Werkstatt'), paragraph(description)), columnCount: '2', items: items.map(([media, width = 'half']) => ({ media, width, caption: null, poster: null })) })

async function media(file, alt) {
  assert.equal(path.basename(file), file)
  const { docs } = await payload.find({ collection: 'media', depth: 0, limit: 2, where: { filename: { equals: file } } })
  assert.ok(docs.length < 2)
  if (docs[0]) return docs[0].id
  const created = await payload.create({ collection: 'media', filePath: path.join(directory, file), data: { alt } })
  console.log(`Medium importiert: ${file} (${created.id})`)
  return created.id
}

try {
  const pages = {}
  await mkdir('.db-backups', { recursive: true })
  for (const area of ['holz', 'laser']) {
    const { docs } = await payload.find({ collection: 'pages', draft: true, depth: 0, limit: 2, where: { werkbereich: { equals: area } } })
    assert.equal(docs.length, 1)
    pages[area] = docs[0]
    await writeFile(`.db-backups/${area}-before-workarea-update-${Date.now()}.json`, JSON.stringify(docs[0], null, 2), { mode: 0o600 })
  }
  const photos = {}
  for (const asset of assets) photos[asset.slug] = await media(asset.file, asset.alt)
  const woodHero = await media('holz-offene-werkstatt.jpg', 'Gemeinsames Arbeiten in der offenen Holzwerkstatt im Rosenwerk')
  const machines = [
    ['formatkreissaege-altendorf-f45', 'Formatkreissäge', 'Altendorf F45', 'Für präzise Zuschnitte von Platten und Massivholz.'],
    ['hammer-hobelmaschine-modell-a3-31g', 'Abricht- und Dickenhobel', 'Hammer A3 31', 'Holzflächen abrichten und Werkstücke auf die passende Dicke bringen.'],
    ['vertikale-bandsaege-mit-staubabsaugung', 'Bandsäge', 'Sägen', 'Für gerade Schnitte und geschwungene Konturen.'],
    ['festool-kappsaege-ks-120-eb', 'Kappsäge', 'Festool KS 120 EB', 'Leisten und Hölzer ablängen und auf Gehrung schneiden.'],
    ['festool-exzenterschleifer-ets-ec-150-5-eq', 'Exzenterschleifer', 'Festool ETS EC 150/5 EQ', 'Flächen schleifen und Oberflächen für die weitere Behandlung vorbereiten.'],
    ['oberfraesentisch-mit-integrierter-fraeseinheit', 'Frästisch', 'Fräsen', 'Kanten, Nuten und Profile am stationären Frästisch bearbeiten.'],
  ]
  const woodLayout = [
    { blockType: 'workshopInfo', blockName: 'Zugang und Nutzung', heading: 'Zugang & Nutzung', access: 'Eigenständig arbeiten als Mitglied – nach der passenden Werkstatt- und Maschineneinweisung. Gäste starten begleitet in der offenen Werkstatt.', costs: 'Für die regelmäßige Nutzung gelten die Mitgliedschafts- und Zugangstarife. In der offenen Werkstatt freuen wir uns über eine Spende für die Unterstützung.' },
    { blockType: 'cta', blockName: 'Offene Holzwerkstatt', richText: rt(heading('Dein Einstieg: die offene Werkstatt'), paragraph('Ob Reparatur, kleines Möbelstück oder erste Schritte mit Holz: Bring deine Idee mit. Das ehrenamtliche Team hilft dir beim Planen und Selbermachen – auch ohne Mitgliedschaft und ohne Vorkenntnisse.'), paragraph('Eine Anmeldung ist normalerweise nicht nötig. Größere Vorhaben bitte vorher mit dem Team besprechen. Die aktuellen Termine stehen im Kalender.')), links: [{ link: link('Termine ansehen', '/calendar') }, { link: link('Projekt besprechen', 'mailto:holz@listen.konglomerat.org') }] },
    { blockType: 'cardGrid', blockName: 'Maschinen der Holzwerkstatt', columnCount: '3', introContent: rt(heading('Platz und Werkzeug für deine Ideen'), paragraph('Auf rund 90 m² findest du Werkbänke, Handwerkzeuge und Maschinen für Zuschnitt, Form und Oberfläche. Hier eine Auswahl – die Karten führen direkt zu den Geräten im Inventar.')), cards: machines.map(([slug, title, eyebrow, description]) => ({ title, eyebrow, description: rt(paragraph(description)), media: photos[slug], enableLink: true, link: link('Im Inventar ansehen', `/resources/${slug}`) })) },
    { blockType: 'inventory', blockName: 'Projekte aus der Holzwerkstatt', contentSource: 'showcase', heading: 'Aus der Holzwerkstatt', description: 'Projekte und Neuigkeiten aus unserem gemeinsamen Werkstattalltag.', tag: 'holzwerkstatt', columnCount: '2' },
    { blockType: 'accordion', blockName: 'Einweisung und erste Schritte', heading: 'Gut vorbereitet an die Werkbank', introContent: rt(paragraph('Welche Einweisung du brauchst, hängt von den Werkzeugen und Maschinen für dein Vorhaben ab. Das Team hilft dir beim Einstieg.')), items: [
      { title: 'Grün: die Grundlagen kennenlernen', content: rt(paragraph('Lies zunächst die Einführung in die Holzwerkstatt. Anschließend klärst du vor Ort die Abläufe und offenen Fragen mit dem Team und bearbeitest den Fragebogen. So lernst du die Werkstatt und ihre Regeln kennen.')) },
      { title: 'Gelb: Einweisung am einzelnen Gerät', content: rt(paragraph('Für die gelb gekennzeichneten Geräte brauchst du eine Einweisung an der jeweiligen Maschine. Sprich das Team an, bevor du sie zum ersten Mal verwendest.')) },
      { title: 'Rot: Einweisung für große Maschinen', content: rt(paragraph('Für Maschinen wie Formatkreissäge, Hobelmaschine und Frästisch ist eine ausführliche Maschineneinweisung erforderlich. Dafür gibt es unter anderem den Kurs „Meggi Messer“; plane etwa sechs bis acht Stunden ein. Termine und Voraussetzungen vereinbarst du mit dem Holzteam.')) },
      { title: 'Kann ich ohne Mitgliedschaft mitmachen?', content: rt(paragraph('Ja, in der offenen Werkstatt arbeitest du unter Begleitung. Für kleine Projekte stehen Handwerkzeuge und geeignete Elektrowerkzeuge bereit. Arbeiten an großen Maschinen übernimmt dort ein eingewiesenes Mitglied. Für regelmäßiges eigenständiges Arbeiten benötigst du die passende Mitgliedschaft und Einweisung.')) },
      { title: 'Material und größere Projekte', content: rt(paragraph('Du kannst eigenes Material mitbringen oder nach verfügbaren Reststücken fragen. Bei größeren Projekten schreibst du uns am besten vorab, was du bauen möchtest, welche Materialien du verwenden willst und wobei du Hilfe brauchst. Die Unterstützung richtet sich nach der Zeit und Erfahrung des ehrenamtlichen Teams.')) },
      { title: 'Was kostet die Unterstützung?', content: rt(paragraph('Für die Begleitung in der offenen Werkstatt wird eine Spende empfohlen. Als Orientierung nennt das Holzteam 30 € je Stunde Unterstützung; der tatsächliche Beitrag ist freiwillig und richtet sich auch nach deinen Möglichkeiten. Mitgliedschaft und eigenständiger Zugang haben eigene Tarife.')) },
    ] },
    { blockType: 'cta', blockName: 'Regelmäßig Holzwerken', richText: rt(heading('Du möchtest regelmäßig hier arbeiten?'), paragraph('Finde den passenden Zugang und sprich mit dem Holzteam über deine Einweisung. Die Werkstatt lebt davon, dass wir Werkzeug, Wissen und Verantwortung teilen.')), links: [{ link: link('Mitgliedschaft & Beiträge', '/monatsbeitrag') }, { link: link('Einweisung anfragen', 'mailto:holz@listen.konglomerat.org') }] },
    gallery('Einblicke in die Holzwerkstatt', 'Gemeinsam arbeiten, Material vorbereiten und Ideen in Holz umsetzen.', [[woodHero, 'full'], [photos.holzwerkstatt], [photos['hammer-hobelmaschine-modell-a3-31g']], [photos['formatkreissaege-altendorf-f45']], [photos['vertikale-bandsaege-mit-staubabsaugung']]]),
  ]
  const wood = await payload.update({ collection: 'pages', id: pages.holz.id, depth: 0, context: { disableRevalidate: true }, data: {
    hero: { type: 'highImpact', media: woodHero, richText: rt(heading('Aus Holz wird dein Projekt.'), paragraph('Sägen, hobeln, schleifen und gemeinsam dazulernen – in der offenen Holzwerkstatt im Rosenwerk.')), links: [{ link: link('Holzteam kontaktieren', 'mailto:holz@listen.konglomerat.org') }] },
    layout: woodLayout,
    sidebarLayout: [
      { blockType: 'contact', blockName: 'Ort', heading: 'Ort', mapUrl: '/resources/holzwerkstatt' },
      { blockType: 'contact', blockName: 'Kontakt', heading: 'Kontakt', email: 'holz@listen.konglomerat.org', introContent: rt(paragraph('Für Projektideen, Einweisungen und Fragen an das Holzteam:')) },
      content('Offene Werkstatt', paragraph('Offene Werkstatt: alle zwei Wochen mittwochs, 18–20 Uhr. Die aktuellen Termine findest du hier.')),
      { blockType: 'appSlot', blockName: 'Termine', slot: 'calendarUpcoming' },
    ],
    meta: { ...pages.holz.meta, title: 'Holzwerkstatt – Konglomerat', description: 'Dein Holzprojekt im Rosenwerk: offene Werkstatt, Maschinen, Einweisungen und gemeinsames Selbermachen in Dresden.', image: woodHero },
    _status: pages.holz._status,
  } })
  assert.equal(wood.layout.length, 7)
  assert.ok(!JSON.stringify(wood).match(/example\.test|Beispielraum|Beispiel-Werkbank/))

  const laser = pages.laser
  const laserLayout = laser.layout.filter(block => block.blockName !== 'Einblicke in die Laserwerkstatt').map(block => {
    if (block.blockType === 'cardGrid' && block.blockName === 'Drei Lasercutter') {
      return { ...block, cards: block.cards.map(card => {
        const slug = /pecker/i.test(card.title) ? 'laserpecker-3d-lasergravierer' : /zing/i.test(card.title) ? 'zing-laser-schneide-und-gravurmaschine' : 'lasersaur-co2-laserbearbeitungsgeraet'
        return { ...card, enableLink: true, link: link('Im Inventar ansehen', `/resources/${slug}`) }
      }) }
    }
    if (block.blockType === 'content' && ['Selbst lasern', 'Dateivorbereitung', 'Material und häufige Fragen'].includes(block.blockName)) {
      const children = block.columns.flatMap(column => column.richText?.root?.children || [])
      const items = []
      let intro = []
      for (const child of children) {
        if (child.type === 'heading' && child.tag !== 'h2') items.push({ title: child.children.map(t => t.text || '').join(''), content: rt() })
        else if (child.type !== 'heading' || child.tag !== 'h2') {
          if (items.length) items.at(-1).content.root.children.push(child)
          else intro.push(child)
        }
      }
      // Keep sections without subheadings in their original rich-text block.
      if (!items.length) return block
      const h = children.find(child => child.type === 'heading' && child.tag === 'h2')
      return { blockType: 'accordion', blockName: block.blockName, heading: h?.children.map(t => t.text || '').join('') || block.blockName, introContent: rt(...intro), items }
    }
    return block
  })
  // Introduce the equipment and examples before the detailed instruction sections.
  const selfIndex = laserLayout.findIndex(block => block.blockName === 'Selbst lasern')
  if (selfIndex >= 0) {
    const [self] = laserLayout.splice(selfIndex, 1)
    const showcaseIndex = laserLayout.findIndex(block => block.blockType === 'inventory')
    laserLayout.splice(showcaseIndex + 1, 0, self)
  }
  laserLayout.push(gallery('Einblicke in die Laserwerkstatt', 'Ein Blick auf unseren gemeinsamen Raum, die Lasercutter und den Arbeitsplatz für die Dateivorbereitung.', [[photos['laser-und-3d-druckwerkstatt'], 'full'], [photos['lasersaur-co2-laserbearbeitungsgeraet']], [photos['zing-laser-schneide-und-gravurmaschine']]]))
  const laserSidebar = laser.sidebarLayout.map(block => block.blockType === 'content' && block.blockName === 'Offene Werkstatt' ? { ...block, columns: content('Offene Werkstatt', paragraph('Lerne den Bereich in der offenen Laserwerkstatt kennen. Die aktuellen Termine und Uhrzeiten findest du hier.')).columns } : block)
  const savedLaser = await payload.update({ collection: 'pages', id: laser.id, depth: 0, context: { disableRevalidate: true }, data: { hero: { ...laser.hero, media: photos['laser-und-3d-druckwerkstatt'] }, layout: laserLayout, sidebarLayout: laserSidebar, _status: laser._status } })
  assert.deepEqual(savedLaser.sidebarLayout.filter(b => b.blockType !== 'content'), laser.sidebarLayout.filter(b => b.blockType !== 'content'))
  assert.equal(savedLaser.layout.filter(b => b.blockType === 'gallery').length, 1)
  for (const name of ['Minutenpreis', 'Gesamtkosten', 'Laserlogbuch und Abrechnung', 'Materialübersicht']) assert.ok(savedLaser.layout.some(b => b.blockName === name), name)
  console.log(JSON.stringify({ holz: { id: wood.id, blocks: wood.layout.length }, laser: { id: savedLaser.id, blocks: savedLaser.layout.length } }))
} finally {
  await payload.db.destroy()
}
