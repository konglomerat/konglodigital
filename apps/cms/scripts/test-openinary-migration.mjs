import assert from 'node:assert/strict'
import { getPayload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import config from '../src/payload.config.ts'
import { up, down } from '../src/migrations/20261003_150000_openinary_media.ts'
const url = new URL(process.env.POSTGRES_URL || 'postgres://invalid')
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/konglo_cms_workareas_migration_test')
const payload = await getPayload({ config })
try {
  await payload.db.drizzle.transaction(async (db) => {
    const { rows: inserted } = await db.execute(sql`INSERT INTO media (alt, filename, url, mime_type) VALUES ('migration-test', 'migration-test.png', '/api/media/file/migration-test.png', 'image/png') RETURNING id`)
    await up({ db })
    const { rows } = await db.execute(sql`SELECT prefix, url FROM media WHERE id = ${inserted[0].id}`)
    assert.deepEqual(rows, [{ prefix: '', url: '/api/media/file/migration-test.png' }])
    await down({ db })
    await db.execute(sql`DELETE FROM media WHERE id = ${inserted[0].id}`)
  })
  console.log('PASS Openinary migration up/down keeps legacy media URLs unchanged')
} finally { await payload.db.destroy() }
