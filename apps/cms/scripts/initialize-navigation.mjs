import { getPayload } from 'payload'
import config from '../src/payload.config.ts'

const payload = await getPayload({ config })
const menus = {
  header: [
    { label: 'Verein', url: '/verein' },
    { label: 'Werkbereiche', url: '/werkbereiche' },
    { label: 'Hier entstanden', url: '/showcase' },
  ],
  footer: [
    { label: 'Impressum', url: 'https://konglomerat.org/impressum', newTab: true },
    { label: 'Datenschutz', url: 'https://konglomerat.org/datenschutz', newTab: true },
    { label: 'Support', url: 'https://support.konglomerat.org', newTab: true },
    { label: 'Design System', url: '/design-system' },
  ],
}
try {
  for (const [slug, links] of Object.entries(menus)) {
    const existing = await payload.findGlobal({ slug, depth: 0 })
    if (existing.id) {
      console.log(`${slug}: already saved; preserved`)
      continue
    }
    await payload.updateGlobal({
      slug,
      data: { navItems: links.map(link => ({ link: { type: 'custom', ...link } })) },
      context: { disableRevalidate: true },
    })
    console.log(`${slug}: initial navigation saved`)
  }
} finally {
  await payload.destroy()
}
