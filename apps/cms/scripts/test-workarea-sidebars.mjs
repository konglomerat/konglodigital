import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

const db = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['localhost', '127.0.0.1'].includes(db.hostname) && db.pathname === '/konglo_cms_workareas_local')
const payload = await getPayload({ config })
const context = { disableRevalidate: true }
let id
try {
  const page = await payload.create({ collection: 'pages', context, data: {
    title: 'Sidebar persistence test', slug: `werkbereich-sidebar-test-${Date.now()}`,
    _status: 'draft', hero: { type: 'none' },
    layout: [{ blockType: 'contact', heading: 'Main contact', email: 'main@example.test' }],
    sidebarLayout: [
      { blockType: 'contact', heading: 'Sidebar contact', email: 'sidebar@example.test' },
      { blockType: 'workshopInfo', heading: 'Ort', location: 'Sidebar room' },
    ],
  } })
  id = page.id
  let read = await payload.findByID({ collection: 'pages', id, draft: true })
  assert.equal(read.layout[0].email, 'main@example.test')
  assert.equal(read.sidebarLayout[0].email, 'sidebar@example.test')
  await payload.update({ collection: 'pages', id, context, data: { sidebarLayout: [...read.sidebarLayout].reverse() } })
  read = await payload.findByID({ collection: 'pages', id, draft: true })
  assert.deepEqual(read.sidebarLayout.map(block => block.blockType), ['workshopInfo', 'contact'])
  assert.equal(read.layout[0].email, 'main@example.test')
  await payload.update({ collection: 'pages', id, context, data: { layout: [{ ...read.layout[0], heading: 'Main changed' }] } })
  read = await payload.findByID({ collection: 'pages', id, draft: true })
  assert.equal(read.layout[0].heading, 'Main changed')
  assert.equal(read.sidebarLayout[1].email, 'sidebar@example.test')
  assert.equal(read.sidebarLayout[0].location, 'Sidebar room')
  console.log('PASS: same block types persist separately in main content and sidebar; reordering and independent edits retain both areas.')
} finally {
  if (id) await payload.delete({ collection: 'pages', id, context })
  await payload.db.destroy()
}
