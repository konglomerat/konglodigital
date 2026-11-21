import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['127.0.0.1', 'localhost'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local')

const paragraph = text => ({ root: {
  type: 'root', version: 1, direction: 'ltr', format: '', indent: 0,
  children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0,
    children: [{ type: 'text', text, version: 1, format: 0, detail: 0, mode: 'normal', style: '' }],
  }],
} })

const payload = await getPayload({ config })
try {
  for (const werkbereich of ['laser', '3d-druck']) {
    const { docs } = await payload.find({ collection: 'pages', draft: true, depth: 0, limit: 2, where: { werkbereich: { equals: werkbereich } } })
    assert.equal(docs.length, 1)
    const page = docs[0]
    const contact = page.sidebarLayout.find(block => block.blockType === 'contact' && block.email)
    const hours = page.sidebarLayout.find(block => block.blockType === 'content' && block.blockName === 'Offene Werkstatt')
    const entry = page.layout.find(block => block.blockType === 'cta')
    assert.ok(contact && hours && entry)
    const membership = contact.links.find(item => item.link?.url === '/monatsbeitrag')
    const membershipParagraph = paragraph(membership?.link.label || 'Zugang & Mitgliedschaft').root.children[0]
    const membershipNode = { type: 'link', version: 3, direction: 'ltr', format: '', indent: 0,
      fields: { linkType: 'custom', url: '/monatsbeitrag', newTab: false }, children: membershipParagraph.children }
    const layout = page.layout.map(block => block.id === entry.id && membership && !JSON.stringify(block).includes('/monatsbeitrag')
      ? { ...block, richText: { ...block.richText, root: { ...block.richText.root,
        children: [...block.richText.root.children, { ...membershipParagraph, children: [membershipNode] }],
      } } } : block)
    const sidebarLayout = page.sidebarLayout.map(block => {
      if (block.id === contact.id) return {
        ...block,
        introContent: paragraph('Für Einweisung und Fragen (Nachricht an den Verteiler):'),
        links: block.links.filter(item => !['/monatsbeitrag', '/werkbereiche/laser', '/werkbereiche/3d-druck'].includes(item.link?.url)),
      }
      if (block.id === hours.id) return {
        ...block,
        columns: [{ ...block.columns[0], richText: paragraph('Offene Werkstatt: jeden 2. und 4. Mittwoch, 18–22 Uhr. Aktuelle Termine siehe unten.') }],
      }
      return block
    })
    if (JSON.stringify({ layout, sidebarLayout }) === JSON.stringify({ layout: page.layout, sidebarLayout: page.sidebarLayout })) {
      console.log({ werkbereich, unchanged: true })
      continue
    }
    await mkdir('.db-backups', { recursive: true })
    await writeFile(`.db-backups/${werkbereich}-before-compact-sidebar-${Date.now()}.json`, JSON.stringify(page, null, 2), { mode: 0o600 })
    const saved = await payload.update({ collection: 'pages', id: page.id, depth: 0, context: { disableRevalidate: true }, data: { layout, sidebarLayout, _status: page._status } })
    assert.equal(saved.sidebarLayout.find(block => block.id === contact.id).email, contact.email)
    assert.equal(saved.sidebarLayout.find(block => block.id === contact.id).links.length, 0)
    assert.ok(JSON.stringify(saved.layout.find(block => block.id === entry.id).richText).includes('/monatsbeitrag'))
    assert.equal(saved.layout.length, page.layout.length)
    assert.equal(saved.sidebarLayout.length, page.sidebarLayout.length)
    console.log({ werkbereich, id: saved.id, contactShortened: true, membershipInMainContent: true })
  }
} finally { await payload.db.destroy() }
