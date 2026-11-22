import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import config from '../src/payload.config.ts'
import { up, down } from '../src/migrations/20261003_140000_werkbereich_pages.ts'

const url = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/konglo_cms_workareas_migration_test')
const payload = await getPayload({ config })
const db = payload.db.drizzle
try {
  await db.transaction(async (tx) => {
    await down({ db: tx })
    await tx.execute(sql`UPDATE pages SET slug = 'holz' WHERE slug = 'werkbereich-holz'`)
    await up({ db: tx })
    const { rows } = await tx.execute(sql`SELECT slug, werkbereich FROM pages WHERE werkbereich = 'holz'`)
    assert.deepEqual(rows, [{ slug: 'werkbereich-holz', werkbereich: 'holz' }])
  })
  console.log('PASS migration down/up; legacy alias normalized without losing page identity')
  await assert.rejects(db.transaction(async (tx) => {
    await down({ db: tx })
    await tx.execute(sql`INSERT INTO pages (title, slug) VALUES ('Legacy duplicate', 'holz')`)
    await up({ db: tx })
  }), (error) => error.cause?.code === '23505' || error.code === '23505')
  const { rows } = await db.execute(sql`SELECT count(*)::int AS count FROM pages`)
  assert.equal(rows[0].count, 16)
  console.log('PASS duplicate legacy pages abort migration and roll back without deleting content')
} finally { await payload.db.destroy() }
