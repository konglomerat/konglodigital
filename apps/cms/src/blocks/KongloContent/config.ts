import type { Block, Field } from 'payload'

import {
  FixedToolbarFeature,
  HeadingFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'

import { link } from '@/fields/link'
import { linkGroup } from '@/fields/linkGroup'

const richTextField = (
  name: string,
  label: string | false,
  headings: Array<'h1' | 'h2' | 'h3' | 'h4'> = ['h2', 'h3', 'h4'],
): Field => ({
  name,
  type: 'richText',
  editor: lexicalEditor({
    features: ({ rootFeatures }) => [
      ...rootFeatures,
      HeadingFeature({ enabledHeadingSizes: headings }),
      FixedToolbarFeature(),
      InlineToolbarFeature(),
    ],
  }),
  label,
})

export const Downloads: Block = {
  slug: 'downloads',
  interfaceName: 'DownloadsBlock',
  labels: { singular: 'Download-Liste', plural: 'Download-Listen' },
  fields: [
    richTextField('introContent', false),
    {
      name: 'items',
      type: 'array',
      required: true,
      minRows: 1,
      admin: { initCollapsed: true },
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'description', type: 'textarea' },
        {
          name: 'file',
          type: 'upload',
          relationTo: 'media',
          admin: {
            description: 'PDF oder anderes Dokument. Alternativ kann eine URL angegeben werden.',
          },
        },
        { name: 'url', type: 'text', label: 'Alternative URL' },
        { name: 'newTab', type: 'checkbox', defaultValue: true },
      ],
    },
  ],
}

export const Gallery: Block = {
  slug: 'gallery',
  interfaceName: 'GalleryBlock',
  labels: { singular: 'Galerie', plural: 'Galerien' },
  fields: [
    richTextField('introContent', false),
    {
      name: 'columnCount',
      type: 'select',
      defaultValue: '3',
      options: [
        { label: '2 Spalten', value: '2' },
        { label: '3 Spalten', value: '3' },
        { label: '4 Spalten', value: '4' },
      ],
    },
    {
      name: 'items',
      type: 'array',
      required: true,
      minRows: 1,
      admin: { initCollapsed: true },
      fields: [
        { name: 'media', type: 'upload', relationTo: 'media', required: true },
        {
          name: 'width',
          type: 'select',
          label: 'Breite',
          defaultValue: 'auto',
          options: [
            { label: 'Nach Spaltenzahl', value: 'auto' },
            { label: 'Volle Breite', value: 'full' },
            { label: 'Halbe Breite', value: 'half' },
            { label: 'Ein Drittel', value: 'third' },
          ],
        },
        {
          name: 'poster',
          type: 'upload',
          relationTo: 'media',
          label: 'Video-Vorschaubild',
          filterOptions: { mimeType: { contains: 'image/' } },
          admin: { description: 'Optionales Standbild für Videos.' },
        },
        { name: 'caption', type: 'text', label: 'Bildunterschrift' },
      ],
    },
  ],
}

export const LogoGrid: Block = {
  slug: 'logoGrid',
  interfaceName: 'LogoGridBlock',
  labels: { singular: 'Logo-Raster', plural: 'Logo-Raster' },
  fields: [
    richTextField('introContent', false),
    {
      name: 'items',
      type: 'array',
      required: true,
      minRows: 1,
      admin: { initCollapsed: true },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'logo', type: 'upload', relationTo: 'media', required: true },
        { name: 'url', type: 'text', label: 'Webseite' },
      ],
    },
  ],
}

export const Embed: Block = {
  slug: 'embed',
  interfaceName: 'EmbedBlock',
  labels: { singular: 'Einbettung', plural: 'Einbettungen' },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'iframe',
      options: [
        { label: 'Webseite / Video-Player', value: 'iframe' },
        { label: 'Videodatei', value: 'video' },
        { label: 'Audiodatei / Podcast', value: 'audio' },
      ],
    },
    {
      name: 'url',
      type: 'text',
      required: true,
      admin: { description: 'Nur HTTPS-URLs werden im Frontend eingebettet.' },
    },
    {
      name: 'aspectRatio',
      type: 'select',
      defaultValue: '16/9',
      options: [
        { label: '16:9', value: '16/9' },
        { label: '4:3', value: '4/3' },
        { label: 'Quadratisch', value: '1/1' },
      ],
    },
    { name: 'caption', type: 'textarea', label: 'Beschreibung' },
  ],
}

export const Contact: Block = {
  slug: 'contact',
  interfaceName: 'ContactBlock',
  labels: { singular: 'Kontakt', plural: 'Kontaktblöcke' },
  fields: [
    { name: 'heading', type: 'text', defaultValue: 'Kontakt' },
    richTextField('introContent', false),
    { name: 'address', type: 'textarea', label: 'Adresse' },
    { name: 'email', type: 'email', label: 'E-Mail' },
    { name: 'phone', type: 'text', label: 'Telefon' },
    {
      name: 'mapUrl',
      type: 'text',
      label: 'Inventar-Ort oder Karten-Link',
      admin: { description: 'Ein Inventar-Ort (z. B. /resources/laser-und-3d-druckwerkstatt) zeigt eine Karte mit den aktuellen Ortsdaten. Alternativ: Link zu OpenStreetMap oder Google Maps.' },
    },
    linkGroup({ overrides: { maxRows: 4 } }),
  ],
}

export const Accordion: Block = {
  slug: 'accordion',
  interfaceName: 'AccordionBlock',
  labels: { singular: 'Akkordeon / Glossar', plural: 'Akkordeons / Glossare' },
  fields: [
    { name: 'heading', type: 'text' },
    richTextField('introContent', false),
    {
      name: 'items',
      type: 'array',
      required: true,
      minRows: 1,
      admin: { initCollapsed: true },
      fields: [{ name: 'title', type: 'text', required: true }, richTextField('content', false)],
    },
  ],
}

export const Stats: Block = {
  slug: 'stats',
  interfaceName: 'StatsBlock',
  labels: { singular: 'Kennzahlen', plural: 'Kennzahlen' },
  fields: [
    richTextField('introContent', false),
    {
      name: 'items',
      type: 'array',
      required: true,
      minRows: 1,
      maxRows: 8,
      admin: { initCollapsed: true },
      fields: [
        { name: 'value', type: 'text', required: true, label: 'Wert' },
        { name: 'label', type: 'text', required: true },
        { name: 'hint', type: 'text', label: 'Zusatz' },
        {
          name: 'tone',
          type: 'select',
          defaultValue: 'grau',
          options: [
            { label: 'Grau', value: 'grau' },
            { label: 'Rosa', value: 'rosa' },
            { label: 'Gelb', value: 'gelb' },
            { label: 'Grün', value: 'gruen' },
          ],
        },
      ],
    },
  ],
}

export const CardGrid: Block = {
  slug: 'cardGrid',
  interfaceName: 'CardGridBlock',
  labels: { singular: 'Karten-Raster', plural: 'Karten-Raster' },
  fields: [
    richTextField('introContent', false),
    {
      name: 'columnCount',
      type: 'select',
      defaultValue: '3',
      options: [
        { label: '2 Spalten', value: '2' },
        { label: '3 Spalten', value: '3' },
        { label: '4 Spalten', value: '4' },
      ],
    },
    {
      name: 'cards',
      type: 'array',
      required: true,
      minRows: 1,
      admin: { initCollapsed: true },
      fields: [
        { name: 'eyebrow', type: 'text', label: 'Kategorie / Augenbraue' },
        { name: 'title', type: 'text', required: true },
        richTextField('description', false, ['h3', 'h4']),
        { name: 'media', type: 'upload', relationTo: 'media' },
        { name: 'enableLink', type: 'checkbox', label: 'Karte verlinken' },
        link({
          overrides: {
            admin: {
              condition: (_data, siblingData) => Boolean(siblingData?.enableLink),
            },
          },
        }),
      ],
    },
  ],
}

export const AppSlot: Block = {
  slug: 'appSlot',
  interfaceName: 'AppSlotBlock',
  labels: { singular: 'Live-Inhalt', plural: 'Live-Inhalte' },
  fields: [
    {
      name: 'slot',
      type: 'select',
      required: true,
      options: [
        { label: 'Nächste Termine', value: 'calendarUpcoming' },
        { label: 'Was gibt’s Neues', value: 'news' },
        { label: 'Showcase des Monats', value: 'showcaseOfMonth' },
        { label: 'Ressource des Monats', value: 'resourceOfMonth' },
      ],
    },
  ],
}

export const Inventory: Block = {
  slug: 'inventory',
  interfaceName: 'InventoryBlock',
  labels: { singular: 'Inventar / Showcase nach Tag', plural: 'Inventar- und Projektlisten' },
  fields: [
    { name: 'contentSource', label: 'Inhalte anzeigen', type: 'select', defaultValue: 'inventory', options: [
      { label: 'Inventargegenstände', value: 'inventory' },
      { label: 'Showcase-Projekte', value: 'showcase' },
    ] },
    { name: 'heading', label: 'Überschrift', type: 'text', defaultValue: 'Inventar' },
    { name: 'description', label: 'Einleitung', type: 'textarea' },
    { name: 'tag', label: 'Tag', type: 'text', required: true,
      validate: (value: unknown) => typeof value === 'string' && /[\p{L}\p{N}]/u.test(value) ? true : 'Bitte einen Tag eingeben.',
      admin: { description: 'Zeigt passende öffentliche Einträge mit Foto und Detail-Link. Je nach Auswahl oben werden Inventargegenstände oder Showcase-Projekte angezeigt. Groß-/Kleinschreibung und äußere Leerzeichen werden ignoriert. Tags werden vollständig verglichen: 3ddrucker und 3d-druck sind unterschiedliche Gruppen.' } },
    { name: 'columnCount', label: 'Einträge pro Zeile', type: 'select', defaultValue: '3', options: [
      { label: '2 pro Zeile', value: '2' }, { label: '3 pro Zeile', value: '3' }, { label: '4 pro Zeile', value: '4' },
    ], admin: { description: 'Bestimmt die Kartengröße: 2 = groß, 3 = mittel, 4 = klein. Auf schmalen Bildschirmen werden weniger Einträge pro Zeile angezeigt; in der Sidebar immer einer.' },
    },
  ],
}
