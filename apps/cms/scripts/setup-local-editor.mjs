// A synthetic editor account for the isolated local CMS only.
import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import config from '../src/payload.config.ts'
const url = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/konglo_cms_workareas_local')
const payload = await getPayload({ config })
try {
  const users = await payload.find({ collection: 'users', limit: 1 })
  if (!users.docs.length) {
    await payload.create({ collection: 'users', data: {
      name: 'Lokale Vorschau', email: 'local-preview@example.test', password: 'Konglo-local-preview-3106!',
    } })
    console.log('Local preview editor created. See README for local-only credentials.')
  } else console.log('Existing local editor retained.')
} finally { await payload.db.destroy() }
