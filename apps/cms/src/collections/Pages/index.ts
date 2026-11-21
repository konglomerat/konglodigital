import type { Block, CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'
import { authenticatedOrPublished } from '../../access/authenticatedOrPublished'
import { Archive } from '../../blocks/ArchiveBlock/config'
import { CallToAction } from '../../blocks/CallToAction/config'
import { Content } from '../../blocks/Content/config'
import { FormBlock } from '../../blocks/Form/config'
import { MediaBlock } from '../../blocks/MediaBlock/config'
import {
  Inventory,
  Accordion,
  AppSlot,
  CardGrid,
  Contact,
  Downloads,
  Embed,
  Gallery,
  LogoGrid,
  Stats,
} from '../../blocks/KongloContent/config'
import { WorkshopInfo, Equipment } from '../../blocks/Workshop/config'
import { uniqueWerkbereich } from './hooks/uniqueWerkbereich'
import { werkbereichOptions } from './werkbereiche'
import { hero } from '@/heros/config'
import { slugField } from '@/fields/slug'
import { populatePublishedAt } from '../../hooks/populatePublishedAt'
import { generatePreviewPath } from '../../utilities/generatePreviewPath'
import { revalidateDelete, revalidatePage } from './hooks/revalidatePage'

import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'

// Both content areas use the same block definitions and database tables.
const pageBlocks: Block[] = [
  Inventory, WorkshopInfo, Equipment, CallToAction, Content, MediaBlock,
  Archive, FormBlock, Downloads, Gallery, LogoGrid, Embed, Contact,
  Accordion, Stats, CardGrid, AppSlot,
]

export const Pages: CollectionConfig<'pages'> = {
  slug: 'pages',
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticatedOrPublished,
    update: authenticated,
  },
  // This config controls what's populated by default when a page is referenced
  // https://payloadcms.com/docs/queries/select#defaultpopulate-collection-config-property
  // Type safe if the collection slug generic is passed to `CollectionConfig` - `CollectionConfig<'pages'>
  defaultPopulate: {
    title: true,
    slug: true,
  },
  admin: {
    description:
      'Öffentliche Unterseiten für Konglo Digital: Titel und Slug festlegen, Inhalte unter Content zusammenstellen und veröffentlichen. Beispielsweise wird kontakt unter /kontakt erreichbar. Entwürfe bleiben privat; veröffentlichte Änderungen werden nach etwa einer Minute beim nächsten Seitenaufruf neu geladen.',
    defaultColumns: ['title', 'werkbereich', 'slug', 'updatedAt'],
    livePreview: {
      url: ({ data, req }) => {
        const path = generatePreviewPath({
          slug: typeof data?.slug === 'string' ? data.slug : '',
          collection: 'pages',
          req,
        })

        return path
      },
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: typeof data?.slug === 'string' ? data.slug : '',
        collection: 'pages',
        req,
      }),
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'werkbereich',
      label: 'Werkbereich',
      type: 'select',
      unique: true,
      options: [...werkbereichOptions],
      admin: {
        position: 'sidebar',
        description: 'Für Werkbereich-Seiten hier den Bereich wählen. Pro Bereich gibt es genau eine Seite; die Adresse wird automatisch gesetzt. Für allgemeine Unterseiten leer lassen.',
      },
    },
    {
      type: 'tabs',
      tabs: [
        {
          fields: [hero],
          label: 'Hero',
        },
        {
          fields: [
            {
              name: 'layout',
              type: 'blocks',
              blocks: pageBlocks,
              required: true,
              admin: {
                initCollapsed: true,
              },
            },
          ],
          label: 'Content',
        },
        {
          label: 'Sidebar',
          description: 'Zusätzliche Informationen zum Werkbereich. Auf großen Bildschirmen rechts neben dem Inhalt, mobil darunter.',
          fields: [
            {
              name: 'sidebarLayout',
              label: 'Sidebar-Blöcke',
              type: 'blocks',
              blocks: pageBlocks,
              defaultValue: [{ blockType: 'appSlot', blockName: 'Termine', slot: 'calendarUpcoming' }],
              admin: {
                initCollapsed: true,
                condition: (data) => Boolean(data?.werkbereich || data?.slug?.startsWith('werkbereich-')),
                description: 'Vorhandene Blöcke hinzufügen und sortieren: z. B. Steckbrief für den Ort, Kontakt oder App-Inhalt „Nächste Termine“. Termine werden automatisch nach dem Werkbereich dieser Seite gefiltert. Wenn leer, erscheint der gefilterte Kalender.',
              },
            },
          ],
        },
        {
          name: 'meta',
          label: 'SEO',
          fields: [
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'meta.image',
            }),
            MetaTitleField({
              hasGenerateFn: true,
            }),
            MetaImageField({
              relationTo: 'media',
            }),

            MetaDescriptionField({}),
            PreviewField({
              // if the `generateUrl` function is configured
              hasGenerateFn: true,

              // field paths to match the target field for data
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        position: 'sidebar',
      },
    },
    ...slugField('title', {
      slugOverrides: {
        unique: true,
        admin: {
          description:
            'URL-Name ohne Schrägstriche, z. B. kontakt, mitglied-werden, kosten, workshops oder begriffe. startseite, verein und werkbereiche bearbeiten bestehende Seiten; werkbereich-holz gehört zu /werkbereiche/holz. App-Adressen wie login, register, account und admin sind reserviert. Neue Seiten unter Hauptmenü oder Footer als internen Link auswählen.',
        },
      },
    }),
  ],
  hooks: {
    beforeValidate: [uniqueWerkbereich],
    afterChange: [revalidatePage],
    beforeChange: [populatePublishedAt],
    afterDelete: [revalidateDelete],
  },
  versions: {
    drafts: {
      autosave: {
        interval: 100, // We set this interval for optimal live preview
      },
      schedulePublish: true,
    },
    maxPerDoc: 50,
  },
}
