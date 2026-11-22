import type { Field } from 'payload'

const resourceFields: Field[] = [
  { name: 'resourceId', label: 'Inventar-ID', type: 'text' },
  { name: 'name', label: 'Bezeichnung', type: 'text' },
  { name: 'slug', label: 'Inventar-Link (Slug)', type: 'text' },
  { name: 'imageUrl', label: 'Vorschaubild-URL', type: 'text' },
]

export const showcaseFields: Field[] = [
  { name: 'sourceType', label: 'Herkunft', type: 'select', defaultValue: 'showcase', options: [{ label: 'Hier entstanden', value: 'showcase' }, { label: 'Legacy-News · alte Webseite', value: 'legacy-news' }], index: true },
  { name: 'originalUrl', label: 'Originalartikel', type: 'text', unique: true, index: true, admin: { description: 'Quellenlink des übernommenen Artikels; dient auch zur Vermeidung doppelter Importe.' } },
  { name: 'legacyImportedAt', label: 'Übernommen am', type: 'date', admin: { readOnly: true } },
  { name: 'legacyDateLabel', label: 'Datumsangabe der Quelle', type: 'text', admin: { description: 'Bei Artikeln ohne Tagesdatum wird nur das bekannte Jahr angezeigt. Published At dient dann ausschließlich der Sortierung.' } },
  { name: 'excerpt', label: 'Kurzbeschreibung', type: 'textarea', admin: { description: 'Für Beitragskarten und als Ausgangstext im Newsletter.' } },
  { name: 'gallery', label: 'Bilder, Videos und Dokumente', type: 'array', admin: { description: 'Reihenfolge durch Ziehen ändern. Bestehende Dateien bleiben unter ihrer bisherigen URL erreichbar. Neue Dateien aus der Mediathek wählen oder hochladen.' }, fields: [
    { name: 'media', label: 'Datei aus der Mediathek', type: 'upload', relationTo: 'media' },
    { name: 'url', label: 'Bestehende Datei-URL', type: 'text', admin: { description: 'Wird verwendet, solange keine Datei aus der Mediathek gewählt ist.' } },
    { name: 'previewUrl', label: 'Video-Vorschau', type: 'text' },
    { name: 'posterUrl', label: 'Video-Standbild', type: 'text' },
  ] },
  { name: 'authorName', label: 'Angezeigter Autor / angezeigte Autorin', type: 'text' },
  { name: 'authorBio', label: 'Über die Person', type: 'textarea' },
  { name: 'authorAvatarUrl', label: 'Profilbild-URL', type: 'text' },
  { name: 'tags', label: 'Schlagwörter', type: 'array', fields: [{ name: 'tag', type: 'text', required: true }], admin: { description: 'Werkbereich-Tags steuern die Projektanzeigen dort. „showcaseofthemonth“ kennzeichnet den Beitrag des Monats.' } },
  { name: 'workshop', label: 'Werkstatt', type: 'group', fields: resourceFields },
  { name: 'resources', label: 'Verwendete Ressourcen', type: 'array', fields: resourceFields },
  { name: 'projectLinks', label: 'Weiterführende Links', type: 'array', fields: [
    { name: 'label', label: 'Beschriftung', type: 'text', required: true },
    { name: 'url', label: 'URL', type: 'text', required: true },
  ] },
  { name: 'socialMediaConsent', label: 'Freigabe für Social Media', type: 'checkbox', defaultValue: false },
  { name: 'mapFeatures', label: 'Kartendaten', type: 'json', admin: { condition: (_, sibling) => Boolean(sibling.mapFeatures) } },
  { name: 'legacyResourceId', label: 'Bisherige Beitrags-ID', type: 'text', unique: true, index: true, admin: { readOnly: true, position: 'sidebar', description: 'Erhält bestehende Links. Nicht ändern.' } },
  { name: 'legacySlug', label: 'Bisheriger Link', type: 'text', index: true, admin: { readOnly: true, position: 'sidebar' } },
  { name: 'sourceCreatedAt', label: 'Ursprünglich erstellt', type: 'date', admin: { readOnly: true, position: 'sidebar' } },
  { name: 'sourceUpdatedAt', label: 'Letzte Änderung vor dem Umzug', type: 'date', admin: { readOnly: true, position: 'sidebar' } },
]
