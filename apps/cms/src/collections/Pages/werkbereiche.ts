// Keep these IDs aligned with Konglo Digital's src/lib/werkbereiche.ts.
export const werkbereichOptions = [
  {
    "value": "darkroom",
    "label": "Darkroom"
  },
  {
    "value": "printshop",
    "label": "Printshop"
  },
  {
    "value": "neuweltbib",
    "label": "Neuweltbib"
  },
  {
    "value": "buchdruck",
    "label": "Buchdruck"
  },
  {
    "value": "holz",
    "label": "Holz"
  },
  {
    "value": "metall",
    "label": "Metall"
  },
  {
    "value": "laser",
    "label": "Laser"
  },
  {
    "value": "3d-druck",
    "label": "3D Druck"
  },
  {
    "value": "elektronik",
    "label": "Elektronik"
  },
  {
    "value": "siebdruck",
    "label": "Siebdruck"
  },
  {
    "value": "beton",
    "label": "Beton"
  },
  {
    "value": "kunststoffschmiede",
    "label": "Kunststoffschmiede"
  },
  {
    "value": "materialvermittlung",
    "label": "Materialvermittlung"
  },
  {
    "value": "cnc",
    "label": "CNC"
  },
  {
    "value": "textil",
    "label": "Textil"
  },
  {
    "value": "riso",
    "label": "Riso"
  }
] as const

export const werkbereichSlugs = new Set<string>(werkbereichOptions.map(({ value }) => value))
export const stripWerkbereichPrefix = (slug: string) => slug.replace(/^(?:werkbereiche?-)+/, '')
export const canonicalPageSlug = (slug: string) => {
  const area = stripWerkbereichPrefix(slug)
  return area && (area !== slug || werkbereichSlugs.has(area)) ? `werkbereich-${area}` : slug
}
