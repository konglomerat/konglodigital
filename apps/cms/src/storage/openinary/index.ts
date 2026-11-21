import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Adapter } from '@payloadcms/plugin-cloud-storage/types'
import type { CollectionBeforeChangeHook } from 'payload'
import { localMediaURL, writeSharedFile } from '../shared-files'

const mediaTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif',
  'video/mp4', 'video/quicktime', 'video/webm',
])
export const usesOpeninary = (mimeType: string) => mediaTypes.has(mimeType.toLowerCase())

const baseURL = () => {
  const url = new URL(process.env.OPENINARY_BASE_URL || 'https://media.konglomerat.org')
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Openinary benötigt HTTPS (HTTP nur für lokale Tests).')
  }
  return url.origin
}

const storagePath = (value: string) => {
  const segments = value.split('/')
  if (segments.some((part) => !part || part === '.' || part === '..' || /[\\%?#\u0000-\u001f]/.test(part))) {
    throw new Error('Ungültiger Openinary-Dateipfad.')
  }
  return segments.map(encodeURIComponent).join('/')
}

/** Storage coordinates are server-owned; metadata edits must not move a file. */
export const assignMediaStorage: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (req.context.skipCloudStorage) return data
  if (req.file) {
    const folder = process.env.OPENINARY_FOLDER || 'konglo-cms'
    storagePath(folder)
    data.prefix = usesOpeninary(req.file.mimetype) ? `${folder}/${randomUUID()}` : ''
    data._objectKey = null
  } else {
    data.prefix = originalDoc?.prefix || ''
    data._objectKey = originalDoc?._objectKey || null
  }
  return data
}

export function openinaryURL(prefix: string, filename: string) {
  // Serve the stored file without another transform that could flatten GIFs.
  return `${baseURL()}/api/download/${storagePath(`${prefix}/${filename}`)}`
}

export const openinaryAdapter: Adapter = ({ collection }) => ({
  name: 'openinary',
  generateURL: ({ filename, prefix }) => prefix
    ? openinaryURL(prefix, filename)
    : localMediaURL(collection.slug, filename),
  async handleUpload({ file, data }) {
    if (!data.prefix) {
      // Openinary does not accept documents such as PDFs. Keep Payload's
      // existing persistent file storage for those and legacy media.
      const dir = typeof collection.upload === 'object' ? collection.upload.staticDir : undefined
      if (!dir || path.basename(file.filename) !== file.filename) throw new Error('Ungültiger lokaler Medienpfad.')
      await mkdir(dir, { recursive: true })
      const bytes = file.tempFilePath ? await readFile(file.tempFilePath) : file.buffer
      await writeSharedFile(file.filename, bytes)
      await writeFile(path.join(dir, file.filename), bytes)
      return
    }
    const apiKey = process.env.OPENINARY_API_KEY?.trim()
    if (!apiKey) throw new Error('OPENINARY_API_KEY fehlt. Das Medium wurde nicht gespeichert.')
    const expectedPath = `${data.prefix}/${file.filename}`
    storagePath(expectedPath)
    const bytes = file.tempFilePath ? await readFile(file.tempFilePath) : file.buffer
    const form = new FormData()
    form.append('files', new File([new Uint8Array(bytes)], file.filename, { type: file.mimeType }))
    form.append('names', file.filename)
    form.append('folder', data.prefix)
    const response = await fetch(`${baseURL()}/api/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form,
      signal: AbortSignal.timeout(120_000), redirect: 'error',
    })
    const result = await response.json().catch(() => null)
    if (!response.ok || result?.success === false || result?.files?.[0]?.path !== expectedPath) {
      // Do not leak upstream response bodies or credentials into CMS errors.
      throw new Error(`Openinary-Upload fehlgeschlagen (HTTP ${response.status}). Bitte erneut versuchen.`)
    }
  },
  // Openinary is a shared media library. Replacing/deleting a CMS record never
  // destroys originals that may still be referenced by a published page.
  handleDelete: () => {},
  // Public files are served directly; Payload keeps serving legacy local files.
  staticHandler: () => new Response(null, { status: 404 }),
})
