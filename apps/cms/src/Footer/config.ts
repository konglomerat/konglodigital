import type { GlobalConfig } from 'payload'

import { link } from '@/fields/link'
import { revalidateFooter } from './hooks/revalidateFooter'
import { authenticated } from '@/access/authenticated'

export const Footer: GlobalConfig = {
  slug: 'footer',
  label: 'Footer',
  admin: {
    description: 'Links in der Fußleiste von Konglo Digital, zum Beispiel Kontakt, Impressum und Datenschutz. Interne Seiten oder externe URLs sind möglich. Reihenfolge, Linktexte und das Öffnen in einem neuen Tab werden übernommen.',
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
        description: 'Bis zu sechs Links. Ein gespeichertes leeres Menü blendet die Footer-Links aus. Logo und Sprachumschalter bleiben sichtbar.',
        initCollapsed: true,
        components: {
          RowLabel: '@/Footer/RowLabel#RowLabel',
        },
      },
    },
  ],
  hooks: {
    afterChange: [revalidateFooter],
  },
}
