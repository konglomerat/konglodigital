import { Banner } from '@payloadcms/ui/elements/Banner'
import React from 'react'
import Link from 'next/link'
import './index.scss'

const baseClass = 'before-dashboard'

const BeforeDashboard: React.FC = () => (
  <div className={baseClass}>
    <Banner className={`${baseClass}__banner`} type="success">
      <h4>Konglomerat CMS</h4>
    </Banner>
    <p>Hier bearbeitest du die Inhalte von Konglo Digital.</p>
    <ul className={`${baseClass}__instructions`}>
      <li>
        Unter <Link href="/admin/collections/pages">Pages</Link> kannst du Unterseiten anlegen,
        Inhalte aus Bausteinen zusammenstellen und als Entwurf speichern oder veröffentlichen.
      </li>
      <li>
        Verlinke veröffentlichte Seiten im <Link href="/admin/globals/header">Hauptmenü</Link> oder
        im <Link href="/admin/globals/footer">Footer</Link>.
      </li>
      <li>
        Bilder und Dateien verwaltest du unter <Link href="/admin/collections/media">Media</Link>.
      </li>
    </ul>
    <a href="https://digital.konglomerat.org" target="_blank" rel="noopener noreferrer">
      Konglo Digital öffnen
    </a>
  </div>
)

export default BeforeDashboard
