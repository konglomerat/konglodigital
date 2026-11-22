import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
import { workareas } from './other-workareas-content.mjs'

const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['localhost', '127.0.0.1'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local')
const directory = process.argv[2] || '/tmp/konglo-other-workareas'
const manifest = JSON.parse(await readFile(path.join(directory, 'assets.json'), 'utf8'))
const payload = await getPayload({ config })
const n = text => ({ type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' })
const p = text => ({ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [n(text)] })
const h = text => ({ ...p(text), type: 'heading', tag: 'h2' })
const rt = (...children) => ({ root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children } })
const link = (label, url) => ({ type: 'custom', label, url, appearance: 'default' })
const content = (blockName, ...children) => ({ blockType: 'content', blockName, columns: [{ size: 'full', richText: rt(...children), enableLink: false }] })

try {
  await mkdir('.db-backups', { recursive: true })
  const { docs: allPages } = await payload.find({ collection: 'pages', draft: true, depth: 0, limit: 100 })
  const protectedPages = allPages.filter(page => ['holz', 'laser', '3d-druck'].includes(page.werkbereich))
  await writeFile(`.db-backups/workareas-before-content-${Date.now()}.json`, JSON.stringify(allPages, null, 2), { mode: 0o600 })
  const mediaIds = {}
  for (const asset of manifest.assets) {
    assert.equal(path.basename(asset.file), asset.file)
    const { docs } = await payload.find({ collection: 'media', depth: 0, limit: 2, where: { filename: { equals: asset.file } } })
    assert.ok(docs.length < 2)
    const media = docs[0] || await payload.create({ collection: 'media', filePath: path.join(directory, asset.file), data: { alt: asset.alt } })
    mediaIds[asset.key] = media.id
    console.log(`Foto: ${asset.key} (${media.id})`)
  }
  const photo = key => mediaIds[manifest.refs[key]]
  const results = []
  for (const area of workareas) {
    const existing = allPages.filter(page => page.werkbereich === area.slug)
    assert.equal(existing.length, 1)
    const page = existing[0]
    assert.ok(photo(`${area.slug}-hero`), `Titelbild fehlt: ${area.slug}`)
    const layout = [
      { blockType: 'mediaBlock', blockName: 'Werkstattfoto zum Einstieg', media: photo(`${area.slug}-hero`) },
      { blockType: 'workshopInfo', blockName: 'Zugang und Nutzung', heading: 'Zugang & Nutzung', access: area.access, costs: area.costs },
      { blockType: 'cta', blockName: 'Einstieg', richText: rt(h(area.start[0]), p(area.start[1])), links: [{ link: link(...area.action) }, ...(area.calendar === false || area.action[1] === '/calendar' ? [] : [{ link: link('Termine ansehen', '/calendar') }])] },
    ]
    if (area.equipment?.length) layout.push({
      blockType: 'cardGrid', blockName: 'Ausstattung aus dem Inventar', columnCount: area.equipment.length === 3 ? '3' : '2',
      introContent: rt(h('Ausstattung'), p('Ein Blick auf die vorhandenen Geräte. Details findest du im jeweiligen Inventareintrag.')),
      cards: area.equipment.map(([slug, title, description], index) => ({ title, description: rt(p(description)), media: photo(`${area.slug}-equipment-${index}`) || null, enableLink: true, link: link('Im Inventar ansehen', `/resources/${slug}`) })),
    })
    if (area.topics?.length) layout.push({
      blockType: 'cardGrid', blockName: 'Möglichkeiten', columnCount: '3', introContent: rt(h('Das kannst du hier entdecken')),
      cards: area.topics.map(([title, description]) => ({ title, description: rt(p(description)), enableLink: false })),
    })
    if (area.showcase) layout.push({ blockType: 'inventory', blockName: 'Projekte und Einblicke', contentSource: 'showcase', heading: 'Projekte & Einblicke', description: 'Aus dem Werkstattalltag: Ideen, Ergebnisse und gemeinsame Vorhaben.', tag: area.showcase, columnCount: '2' })
    layout.push({ blockType: 'accordion', blockName: 'Fragen zum Einstieg', heading: 'Gut zu wissen', items: area.faqs.map(([title, answer]) => ({ title, content: rt(p(answer)) })) })
    const furtherLinks = [['Website des Werkbereichs', area.source], ...(area.extraLinks || [])]
    layout.push({ blockType: 'cardGrid', blockName: 'Weitere Informationen', columnCount: '2', introContent: rt(h('Weiterlesen & planen')), cards: furtherLinks.map(([title, url]) => ({ title, enableLink: true, link: link(title, url) })) })
    if (area.gallery?.length) layout.push({ blockType: 'gallery', blockName: 'Weitere Einblicke', introContent: rt(h('Weitere Einblicke')), columnCount: '2', items: area.gallery.map((_, index) => ({ media: photo(`${area.slug}-gallery-${index}`), width: area.gallery.length === 1 ? 'full' : 'half', caption: null, poster: null })) })
    const sidebarLayout = [
      { blockType: 'contact', blockName: 'Ort', heading: 'Ort', ...(area.place ? { mapUrl: `/resources/${area.place}`, ...(area.address ? { address: area.address } : {}) } : { address: 'Rosenwerk · Jagdweg 1–3 · 01159 Dresden\nZugang über die Rosenstraße; Besuch bitte vorab abstimmen.' }) },
      { blockType: 'contact', blockName: 'Kontakt', heading: 'Kontakt', ...(area.email ? { email: area.email, introContent: rt(p(area.slug === 'metall' ? 'Direkter Kontakt zu den Werkstadtpirat*innen:' : 'Für Fragen, Vorhaben und deinen Einstieg:')) } : { introContent: rt(p('Die nächsten offenen Termine findest du im Kalender. Weitere Informationen gibt es auf der Werkstatt-Website.')), links: [{ link: link('Werkstatt-Website', area.source) }] }) },
    ]
    if (area.calendar !== false) sidebarLayout.push(content('Aktuelle Termine', p('Aktuelle Termine und Uhrzeiten findest du hier. Bitte beachte die Hinweise zur Anmeldung.')), { blockType: 'appSlot', blockName: 'Termine', slot: 'calendarUpcoming' })
    const saved = await payload.update({ collection: 'pages', id: page.id, depth: 0, context: { disableRevalidate: true }, data: {
      title: area.title, hero: { type: 'none', media: photo(`${area.slug}-hero`), richText: null, links: [] }, layout, sidebarLayout,
      meta: { ...page.meta, title: `${area.title} – Konglomerat`, description: area.summary, image: photo(`${area.slug}-hero`) },
      _status: 'published',
    } })
    assert.equal(saved.hero.type, 'none')
    assert.ok(saved.layout.length >= 6)
    assert.ok(!JSON.stringify(saved).match(/example\.test|Beispielraum|Steckbrief ergänzen/))
    results.push({ area: area.slug, id: saved.id, blocks: saved.layout.length })
    console.log(`Seite gespeichert: ${area.slug}`)
  }
  for (const before of protectedPages) {
    const after = await payload.findByID({ collection: 'pages', id: before.id, depth: 0, draft: true })
    assert.deepEqual(after.layout, before.layout)
    assert.deepEqual(after.hero, before.hero)
    assert.deepEqual(after.sidebarLayout, before.sidebarLayout)
  }
  await writeFile(path.join(directory, 'import-results.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results))
} finally { await payload.db.destroy() }
