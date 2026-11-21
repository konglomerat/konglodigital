import type { GlobalConfig } from 'payload'

import { link } from '@/fields/link'
import { revalidateHeader } from './hooks/revalidateHeader'
import { authenticated } from '@/access/authenticated'

export const Header: GlobalConfig = {
  slug: 'header',
  label: 'Hauptmenü',
  admin: {
    description: 'Öffentliche Navigation von Konglo Digital auf Desktop und Mobilgeräten. Veröffentliche zuerst die Zielseite und wähle sie dann als internen Link. Reihenfolge und Linktexte werden übernommen; Konto- und Werkstattfunktionen bleiben separat verfügbar. Änderungen werden nach etwa einer Minute beim nächsten Aufruf neu geladen.',
  },
  access: {
    read: () => true,
    update: authenticated,
  },
  fields: [
    {
      name: 'navItems',
      type: 'array',
      fields: [
        link({
          appearances: false,
        }),
      ],
      maxRows: 6,
      admin: {
        description: 'Bis zu sechs Links. Ein gespeichertes leeres Menü blendet die öffentlichen Links aus.',
        initCollapsed: true,
        components: {
          RowLabel: '@/Header/RowLabel#RowLabel',
        },
      },
    },
  ],
  hooks: {
    afterChange: [revalidateHeader],
  },
}
