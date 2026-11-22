import type { CollectionConfig } from 'payload'

import {
  FixedToolbarFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import path from 'path'
import { fileURLToPath } from 'url'

import type { Media as MediaDocument } from '../payload-types'
import { assignMediaStorage, openinaryURL } from '../storage/openinary'
import { localMediaURL } from '../storage/shared-files'
import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: { description: 'Bilder und Videos liegen in Openinary auf media.konglomerat.org. Dokumente wie PDFs bleiben im CMS-Dateispeicher. Löschen entfernt den CMS-Eintrag; Originaldateien bleiben erhalten.' },
  hooks: { beforeChange: [assignMediaStorage] },
  fields: [
    {
      name: 'alt',
      type: 'text',
      //required: true,
    },
    {
      name: 'caption',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ rootFeatures }) => {
          return [...rootFeatures, FixedToolbarFeature(), InlineToolbarFeature()]
        },
      }),
    },
  ],
  upload: {
    // Upload to the public/media directory in Next.js making them publicly accessible even outside of Payload
    staticDir: process.env.PAYLOAD_MEDIA_DIR || path.resolve(dirname, '../../public/media'),
    adminThumbnail: ({ doc }) => {
      const media = doc as unknown as MediaDocument
      if (!media.mimeType?.startsWith('image/')) return null
      const filename = media.sizes?.thumbnail?.filename || media.filename
      if (!filename) return null
      return media.prefix
        ? openinaryURL([media.prefix, media._objectKey].filter(Boolean).join('/'), filename)
        : localMediaURL('media', filename)
    },
    focalPoint: true,
    imageSizes: [
      {
        name: 'thumbnail',
        width: 300,
      },
      {
        name: 'square',
        width: 500,
        height: 500,
      },
      {
        name: 'small',
        width: 600,
      },
      {
        name: 'medium',
        width: 900,
      },
      {
        name: 'large',
        width: 1400,
      },
      {
        name: 'xlarge',
        width: 1920,
      },
      {
        name: 'og',
        width: 1200,
        height: 630,
        crop: 'center',
      },
    ],
  },
}
