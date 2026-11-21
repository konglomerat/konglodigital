import { ValidationError, type CollectionBeforeValidateHook } from 'payload'
import { formatSlug } from '../../../fields/slug/formatSlug'
import { canonicalPageSlug, stripWerkbereichPrefix, werkbereichSlugs } from '../werkbereiche'

// Covers the editor, REST, Local API, drafts and legacy URL aliases.
export const uniqueWerkbereich: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  if (!data) return data
  const enteredSlug = formatSlug(data.slug ?? originalDoc?.slug ?? data.title ?? '')
  const inferredArea = stripWerkbereichPrefix(enteredSlug)
  const area = data.werkbereich || (werkbereichSlugs.has(inferredArea) ? inferredArea : null)
  const slug = canonicalPageSlug(area ? `werkbereich-${area}` : enteredSlug)
  data.slug = slug
  data.werkbereich = area
  if (!slug.startsWith('werkbereich-')) return data

  const areaSlug = stripWerkbereichPrefix(slug)
  const result = await req.payload.find({
    collection: 'pages',
    req,
    overrideAccess: true,
    draft: true,
    depth: 0,
    limit: 1,
    where: { and: [
      { or: [
        { slug: { in: [slug, `werkbereiche-${areaSlug}`, areaSlug] } },
        ...(area ? [{ werkbereich: { equals: area } }] : []),
      ] },
      ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []),
    ] },
  })
  const existing = result.docs[0]
  if (existing) {
    throw new ValidationError({ errors: [{ path: 'werkbereich', message:
      `Für diesen Werkbereich existiert bereits eine Seite: „${existing.title}“. Bitte diese Seite bearbeiten.`,
    }] })
  }
  return data
}
