import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['127.0.0.1', 'localhost'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local')

const richText = (entries) => ({
  root: {
    type: 'root', version: 1, direction: 'ltr', format: '', indent: 0,
    children: entries.map(([type, text]) => ({
      type, ...(type === 'heading' ? { tag: 'h2' } : {}),
      version: 1, direction: 'ltr', format: '', indent: 0,
      children: [{ type: 'text', text, version: 1, format: 0, detail: 0, mode: 'normal', style: '' }],
    })),
  },
})

const payload = await getPayload({ config })
try {
  for (const werkbereich of ['laser', '3d-druck']) {
    const { docs } = await payload.find({ collection: 'pages', draft: true, depth: 0, limit: 2, where: { werkbereich: { equals: werkbereich } } })
    assert.equal(docs.length, 1)
    const page = docs[0]
    // Keep independently edited sidebars intact when this script runs again.
    if (page.sidebarLayout?.some(block => block.blockType !== 'appSlot')) {
      console.log(`${werkbereich}: existing sidebar retained`)
      continue
    }
    await mkdir('.db-backups', { recursive: true })
    await writeFile(`.db-backups/${werkbereich}-before-sidebar-${Date.now()}.json`, JSON.stringify(page, null, 2), { mode: 0o600 })
    const info = page.layout.find(block => block.blockType === 'workshopInfo')
    const contacts = page.layout.filter(block => block.blockType === 'contact')
    const sidebarLayout = []
    if (info?.location) sidebarLayout.push({
      blockType: 'content', blockName: 'Ort',
      columns: [{ size: 'full', richText: richText([['heading', 'Ort'], ['paragraph', info.location]]) }],
    })
    sidebarLayout.push(...contacts.map(block => ({ ...block, heading: 'Kontakt' })))
    if (info?.hours) sidebarLayout.push({
      blockType: 'content', blockName: 'Offene Werkstatt',
      columns: [{ size: 'full', richText: richText([['heading', 'Offene Werkstatt'], ['paragraph', info.hours]]) }],
    })
    sidebarLayout.push({ blockType: 'appSlot', blockName: 'Termine', slot: 'calendarUpcoming' })
    const layout = page.layout.filter(block => block.blockType !== 'contact').map(block =>
      block.blockType === 'workshopInfo' ? { ...block, heading: 'Zugang & Nutzung', location: null, hours: null } : block,
    )
    const saved = await payload.update({
      collection: 'pages', id: page.id, context: { disableRevalidate: true },
      data: { layout, sidebarLayout, _status: page._status },
    })
    assert.equal(saved.sidebarLayout.length, sidebarLayout.length)
    assert.equal(saved.layout.length, layout.length)
    assert.equal(saved.sidebarLayout.find(block => block.blockType === 'contact')?.email, contacts[0]?.email)
    console.log({ werkbereich, id: saved.id, sidebar: saved.sidebarLayout.map(block => block.blockType) })
  }
} finally {
  await payload.db.destroy()
}
