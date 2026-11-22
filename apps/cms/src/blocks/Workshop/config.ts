import type { Block } from 'payload'

export const WorkshopInfo: Block = {
  slug: 'workshopInfo',
  interfaceName: 'WorkshopInfoBlock',
  labels: { singular: 'Werkbereich: Steckbrief', plural: 'Werkbereich-Steckbriefe' },
  fields: [
    { name: 'heading', type: 'text', defaultValue: 'Auf einen Blick' },
    { name: 'location', label: 'Ort / Raum', type: 'text' },
    { name: 'access', label: 'Zugang und Einweisung', type: 'textarea' },
    { name: 'hours', label: 'Offene Werkstatt / Zeiten', type: 'textarea' },
    { name: 'costs', label: 'Kosten und Material', type: 'textarea' },
  ],
}

export const Equipment: Block = {
  slug: 'equipment',
  interfaceName: 'EquipmentBlock',
  labels: { singular: 'Werkbereich: Ausstattung', plural: 'Ausstattungslisten' },
  fields: [
    { name: 'heading', type: 'text', defaultValue: 'Ausstattung' },
    { name: 'description', label: 'Einleitung', type: 'textarea' },
    {
      name: 'items', type: 'array', required: true, minRows: 1,
      admin: { initCollapsed: true, description: 'Redaktionelle Übersicht. Live-Verfügbarkeit und persönliche Berechtigungen bleiben in der Ressourcenverwaltung.' },
      fields: [
        { name: 'name', label: 'Maschine / Werkzeug', type: 'text', required: true },
        { name: 'description', label: 'Was ist damit möglich?', type: 'textarea' },
        { name: 'requirement', label: 'Voraussetzung / Einweisung', type: 'text' },
      ],
    },
  ],
}
