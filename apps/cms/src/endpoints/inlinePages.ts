import { createHash } from 'node:crypto'
import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'
import type { Endpoint, PayloadRequest } from 'payload'
import type { Page } from '../payload-types'
import { getSSOConfig, verifyFrontendEditorIdentity } from '../auth/supabase/core'
import { ensurePayloadUser } from '../auth/supabase/endpoints'

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
const editable = (page: Page) => ({
  title: page.title,
  hero: page.hero,
  layout: page.layout,
  sidebarLayout: page.sidebarLayout,
  meta: page.meta,
})
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : // Payload may materialize default block/array IDs anew on reads of empty fields.
      // Relationship values are scalar IDs and remain part of the comparison.
      value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([key]) => key !== 'id')
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, canonical(item)]),
        )
      : value
const revision = (page: Page) =>
  createHash('sha256')
    .update(JSON.stringify(canonical([page.updatedAt, editable(page)])))
    .digest('hex')

async function handle(req: PayloadRequest, save: boolean) {
  const token = req.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1]
  if (!token) return json({ error: 'Bitte anmelden.' }, 401)
  let identity
  try {
    identity = await verifyFrontendEditorIdentity(getSSOConfig(), token)
  } catch {
    return json({ error: 'Keine Berechtigung zur Seitenbearbeitung.' }, 403)
  }
  const id = Number(req.routeParams?.id)
  if (!Number.isSafeInteger(id) || id < 1) return json({ error: 'Ungültige Seite.' }, 400)
  let transactionID: string | number | undefined
  try {
    if (save) {
      const raw = await req.text?.()
      if (!raw || Buffer.byteLength(raw) > 2_000_000)
        return json({ error: 'Die Änderung ist zu groß oder leer.' }, 400)
      let body
      try {
        body = JSON.parse(raw)
      } catch {
        return json({ error: 'Ungültige Änderung.' }, 400)
      }
      const data = body?.page
      if (
        !data ||
        typeof data.title !== 'string' ||
        !data.title.trim() ||
        !Array.isArray(data.layout) ||
        !Array.isArray(data.sidebarLayout) ||
        typeof body.revision !== 'string'
      )
        return json({ error: 'Titel und Seiteninhalt fehlen.' }, 400)
      const user = await ensurePayloadUser(req.payload, identity)
      transactionID = (await req.payload.db.beginTransaction()) ?? undefined
      if (!transactionID) throw new Error('Transaction unavailable')
      // This installation uses the Postgres adapter configured in payload.config.
      const tx = (req.payload.db as unknown as PostgresAdapter).sessions[transactionID]?.db
      if (!tx) throw new Error('Transaction unavailable')
      await tx.execute(sql`SELECT id FROM pages WHERE id = ${id} FOR UPDATE`)
      const localReq = { transactionID, user: { ...user, collection: 'users' as const } }
      const current = await req.payload.findByID({
        collection: 'pages',
        id,
        draft: true,
        depth: 0,
        req: localReq,
        overrideAccess: false,
      })
      if (revision(current) !== body.revision) {
        await req.payload.db.rollbackTransaction(transactionID)
        transactionID = undefined
        return json(
          {
            error:
              'Die Seite wurde inzwischen geändert. Lade den aktuellen Stand, bevor du deine Änderungen erneut übernimmst.',
          },
          409,
        )
      }
      const saved = await req.payload.update({
        collection: 'pages',
        id,
        depth: 0,
        req: localReq,
        overrideAccess: false,
        data: { ...editable(data), _status: 'published' },
      })
      await req.payload.db.commitTransaction(transactionID)
      transactionID = undefined
      return json({ page: editable(saved), revision: revision(saved) })
    }
    // Authentication above is required even for unpublished content and the media library.
    const page = await req.payload.findByID({ collection: 'pages', id, draft: true, depth: 0 })
    const [media, pages] = await Promise.all([
      req.payload.find({ collection: 'media', depth: 0, limit: 200, sort: '-updatedAt' }),
      req.payload.find({
        collection: 'pages',
        depth: 0,
        limit: 200,
        sort: 'title',
        select: { title: true, slug: true },
      }),
    ])
    return json({
      page: editable(page),
      revision: revision(page),
      cmsEditUrl: `${getSSOConfig().cmsOrigin}/admin/collections/pages/${id}`,
      media: media.docs.map((m) => ({
        id: m.id,
        label: m.alt || m.filename,
        url: m.thumbnailURL || m.url,
      })),
      pages: pages.docs.map((p) => ({ id: p.id, label: p.title })),
    })
  } catch (error) {
    if (transactionID) await req.payload.db.rollbackTransaction(transactionID)
    const status =
      error && typeof error === 'object' && 'status' in error ? Number(error.status) : 500
    return json(
      {
        error:
          status === 404
            ? 'Seite nicht gefunden.'
            : status === 400
              ? 'Bitte prüfe die Eingaben. Das CMS hat die Änderung abgelehnt.'
              : 'Das CMS konnte die Seite nicht speichern oder laden.',
      },
      [400, 404].includes(status) ? status : 500,
    )
  }
}

export const inlinePageEndpoints: Endpoint[] = [
  { path: '/inline-pages/:id', method: 'get', handler: (req) => handle(req, false) },
  { path: '/inline-pages/:id', method: 'patch', handler: (req) => handle(req, true) },
]
