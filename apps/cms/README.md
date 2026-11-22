# Konglo Payload CMS

Der CMS-Code liegt zusammen mit der Website in `apps/cms`. Beide Anwendungen
behalten eigene `package.json`, Lockfiles, Node-Abhängigkeiten und `.env`-Dateien.
Es gibt bewusst kein gemeinsames npm-Workspace und keine gekoppelte Installation.

Vom Repository-Hauptverzeichnis:

```sh
npm run cms:install
npm run cms:dev
npm run cms:test
npm run cms:build
```

Das CMS benötigt Node.js 22.12 oder neuer. Vor dem ersten lokalen Start die
CMS-Zugangsdaten in `apps/cms/.env.development.local` bereitstellen; die Website
verwendet weiterhin ihre eigene `.env.local` im Hauptverzeichnis. Für den
produktiven Build gelten die CMS-Variablen in Dokploy bzw. `apps/cms/.env`.
`.env.example` dokumentiert nur Platzhalter und wird nie als echte Konfiguration verwendet.

Für die gemeinsame Datenbank muss `POSTGRES_URL` lokal auf
`127.0.0.1:55432/konglo_cms` zeigen. SSH-Zugriff über `konglo-server` ist erforderlich.
Der Dev-Start richtet den Tunnel ein. Die vorhandene lokale Konfiguration wurde
beim Umzug übernommen, aber weder Konfiguration noch Backups sind versioniert.
Die Sicherungen vom 22.11.2026 bleiben zusätzlich im bisherigen benachbarten
CMS-Verzeichnis `../konglo/.db-backups/shared-cms-20261122/` erhalten.

## Getrenntes Deployment

- Website: Build-Kontext und Anwendungspfad bleiben das Repository-Hauptverzeichnis.
- CMS: Build-Kontext/Anwendungspfad `apps/cms`, `npm ci`, `npm run build`,
  `npm run start -- --hostname 0.0.0.0 --port 3000`.
- Dokploy Drop: im Verzeichnis `apps/cms` mit
  `python3 scripts/package-deployment.py /sicherer/pfad/konglo-cms.zip` paketieren.
  Das Archiv enthält ausschließlich die CMS-Anwendung, nicht die Website.
- Das produktive Medien-Volume und die CMS-Umgebungsvariablen beibehalten.
  Ein Code-Merge führt keine Datenmigration und kein Deployment aus.
- Schemaänderungen nur als geprüfte Migrationen anwenden; `db.push` bleibt aus.

`npm test` führt ausschließlich isolierte Tests ohne Datenbankzugriff aus.
Historische Import- und Integrationstestskripte sind keine normalen Tests; ihre
Schutzprüfungen für isolierte Datenbanken dürfen nicht entfernt werden.

## Gemeinsames CMS seit 22.11.2026

Lokales CMS und `https://backend.konglomerat.org/admin` verwenden dieselbe
produktive PostgreSQL-Datenbank `konglo_cms`. Lokale redaktionelle Änderungen
sind damit auch produktiv wirksam. `db.push` ist überall deaktiviert;
Schemaänderungen werden ausschließlich über geprüfte Migrationen angewendet.

`npm run dev` oder `npm run dev:local` öffnet einen SSH-Tunnel über den vorhandenen
SSH-Host `konglo-server` und startet das lokale CMS unter `http://localhost:3106`.
Der Tunnel bindet nur an `127.0.0.1:55432`; auf dem Server bleibt PostgreSQL ohne
öffentlichen Port. Der Start ermittelt die aktuelle interne Container-Adresse.
Ohne SSH-Verbindung gibt es keinen Rückfall auf eine andere Datenbank.
Die privaten Verbindungsdaten stehen in `.env.development.local` und `.env`.
Der lokale OAuth-Client und seine localhost-Rückleitung bleiben separat.

Beide Instanzen nutzen Openinary und das Volume `konglo-payload-media`.
PDFs/SVGs und sonstige lokale Formate werden beim lokalen Upload per SSH atomar
in dieses Volume geschrieben; öffentliche URLs zeigen immer auf das produktive
CMS. `PAYLOAD_MEDIA_PUBLIC_ORIGIN`, `PAYLOAD_MEDIA_SSH_HOST` und
`PAYLOAD_MEDIA_REMOTE_DIR` konfigurieren diesen lokalen Zugriff. Im Deployment
bleiben die SSH-Variablen ungesetzt, dort schreibt Payload direkt ins Volume.

Sicherung und geprüfter Merge: `.db-backups/shared-cms-20261122/` lokal und
`/root/backups/shared-cms-20261122/` auf dem Server. Enthalten sind Datenbank-Dumps,
Medien, Konfiguration, Quellcode sowie Importberichte mit den ID-Zuordnungen.
Die produktive Sicherung wurde vor dem Merge in
`konglo_cms_merge_test_20261122` wiederhergestellt und der Import dort geprüft.
Die vorherige lokale Datenbank `konglo_cms_workareas_local` bleibt erhalten,
wird im normalen Betrieb aber nicht mehr verwendet. Historische Import- und
Fixture-Skripte behalten ihre Schutzprüfung für genau diese isolierte Datenbank.

## Produktion: backend.konglomerat.org

- CMS: `https://backend.konglomerat.org/admin`; `/` leitet zur Redaktion weiter.
- Dokploy-Projekt: **Konglodigital**, Umgebung **production**, Anwendung
  **Konglo Payload CMS** (`YpAjy8rlJaaIlsl35ZstR`).
- Domain: `backend.konglomerat.org`, Port 3000, HTTPS mit Let's Encrypt.
  Bei INWX zeigt der A-Record `backend` auf `62.238.5.100` (TTL 300).
  DNS und das Let’s-Encrypt-Zertifikat wurden am 03.10.2026 geprüft.
- Build: Node 22, Nixpacks, `npm run build`; Start siehe `nixpacks.toml`.
  Der Build verwendet einen Worker und ein Node-Heap-Limit von 1536 MiB.
  Payload 3.90.2 / Next 16.3.8; keine automatische Schema-Synchronisierung in Produktion.
  CMS-Seiten werden zur Laufzeit gerendert; der Docker-Build benötigt keinen
  Zugriff auf das private Datenbanknetz (keine Datenabfragen in `generateStaticParams`).
- Benötigte Umgebungsvariablen: `POSTGRES_URL`, `PAYLOAD_SECRET`,
  `NEXT_PUBLIC_SERVER_URL=https://backend.konglomerat.org`, `PREVIEW_SECRET`,
  `CRON_SECRET` und `PAYLOAD_MEDIA_DIR=/app/public/media`.
  Geheimnisse liegen in Dokploy, nicht im Deployment-Archiv.
- Uploads liegen im benannten Docker-Volume `konglo-payload-media`, eingebunden
  unter `/app/public/media`. Datenbank und dieses Volume separat sichern.
- Datenbank seit 29.10.2026: Dokploy-Service **Konglo CMS PostgreSQL**
  (`jfbP7bZZL3gaRylxrXFuE`), PostgreSQL 17, interne Adresse
  `konglo-cms-postgres-bpnl8u:5432`, Datenbank/Benutzer `konglo_cms`.
  Kein öffentlicher Datenbank-Port. Payload verwendet `@payloadcms/db-postgres`.
  Auf ausdrücklichen Wunsch wurde die Sicherung vom 03.10.2026 wiederhergestellt
  (5 Seiten, 1 Benutzer, 1 Medieneintrag); spätere Änderungen sind darin nicht enthalten.
  Die bisherige Neon-Datenbank bleibt erhalten.
  Anmeldung über Supabase OAuth (`SUPABASE_SSO_ENABLED=true`); das bestehende
  CMS-Konto ist nach Identitätsprüfung mit der Supabase-ID verknüpft.
- Konglo Digital verwendet `PAYLOAD_CMS_URL=https://backend.konglomerat.org`.

Vor dem ersten Produktionsstart wurden die Migrationen
`20261003_120000_supabase_sso` und `20261003_130000_production_payload_update`
transaktional angewendet. Die Sicherung davor liegt lokal unter
`.db-backups/2026-10-03-before-production.dump` (nicht versioniert).
Bei der Wiederherstellung am 29.10.2026 wurden außerdem die Migrationen
`20261003_140000_werkbereich_pages` und `20261003_150000_openinary_media`
angewendet und die vollständige Migrationshistorie im Ziel geprüft.
Das anschließende Deployment wurde live geprüft: `/` führt nach `/admin`,
Anmeldeseite und veröffentlichte Seiten/API liefern HTTP 200, `/api/users`
liefert ohne Anmeldung 403 und die wiederhergestellte PNG-Datei ist erreichbar.
Weitere Schemaänderungen vor dem Deployment als Migration prüfen und ausführen;
`db.push` bleibt in Produktion deaktiviert.

Für ein weiteres Drop-Deployment erzeugt
`python3 scripts/package-deployment.py /sicherer/pfad/konglo-cms.zip` ein Archiv
inklusive vorhandener Medien, ohne `.env`, Backups oder Build-Ausgaben. Das
Archiv enthält den Quellcode als TAR und entpackt ihn vor `npm ci`, weil die
installierte Dokploy-Version gültige Dateinamen mit Sonderzeichen beim
ZIP-Upload ablehnt. Der Upload funktioniert über
`/api/trpc/application.dropDeployment` als Multipart-Formular mit `zip`,
`applicationId` und `dropBuildPath=/`; der öffentliche OpenAPI-Upload ist in
dieser Installation fehlerhaft. Das bestehende Medien-Volume bei Deployments
beibehalten.

`NODE_ENV=production npm run payload -- run scripts/initialize-navigation.mjs`
legt die bisherigen Digital-Menüs nur an, wenn der jeweilige Global noch nie
gespeichert wurde. Vorhandene Menüs, auch bewusst leere, bleiben erhalten.

## Gemeinsamer Login mit der Konglomerat-Website

Payload kann das Supabase-Konto der Website über OAuth verwenden. Die Anmeldung
beginnt im CMS unter `/admin/login` mit **Mit Supabase anmelden**. Die bereits
vorhandene Website-Seite `/de/oauth/consent` übernimmt Anmeldung und Zustimmung.
Payload prüft anschließend serverseitig das Konto und eine globale Rolle `backend`
oder `admin` in `public.role_assignments`, entsprechend `backend.login` auf der Website.

Der selbst gehostete Auth-Dienst wurde dafür am 29.10.2026 von GoTrue v2.171.0 auf
v2.197.0 aktualisiert. Der registrierte vertrauliche Client heißt **Konglomerat CMS**;
seine einzige Redirect-URI ist `https://backend.konglomerat.org/api/sso/callback`.
Die dynamische Client-Registrierung bleibt deaktiviert. Vorherige Konfiguration und
Datenbanksicherung liegen geschützt in `.db-backups/20261029-sso-*` beziehungsweise
`.db-backups/20261029-supabase-before-oauth.dump` (nicht versioniert).

### Einrichtung

1. In Supabase den OAuth-Server aktivieren. Als Authorization Path die bestehende
   Website-Route `/de/oauth/consent` einstellen; die Supabase Site URL muss zur
   Website gehören.
2. Einen vertraulichen OAuth-Client für das CMS registrieren, mit
   `token_endpoint_auth_method=client_secret_basic` und der exakten Redirect-URI
   `https://<cms-domain>/api/sso/callback` (lokal z. B.
   `http://localhost:3001/api/sso/callback`).
3. Im Payload-Deployment `NEXT_PUBLIC_SERVER_URL` auf den öffentlichen CMS-Origin
   setzen und `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_OAUTH_CLIENT_ID` und
   `SUPABASE_OAUTH_CLIENT_SECRET` hinterlegen. Der Client-Secret bleibt serverseitig;
   der öffentliche Anon-Key wird für Kong auch an den Autorisierungslink angehängt.
   Ein Supabase-Service-Role-Key wird im CMS nicht benötigt. Außer bei localhost ist
   HTTPS vorgeschrieben. Den bestehenden `PAYLOAD_SECRET` sicher konfigurieren.
4. Die Payload-Migrationen mit `pnpm payload migrate` im vorgesehenen Deployment
   ausführen. Die Migration `20261003_120000_supabase_sso` ergänzt eine eindeutige,
   optionale Supabase-ID an den CMS-Benutzern; bestehende Datensätze bleiben erhalten.
   Auf Website/Supabase-Seite muss das aktuelle Rollenmodell mit `role_assignments`
   angewendet und eine globale Rolle `backend` oder `admin` zugewiesen sein. Die
   RLS-Regel muss das Lesen der eigenen Zuweisungen auch für OAuth-Tokens erlauben.
5. `SUPABASE_SSO_ENABLED=true` setzen und Payload neu starten. Dann sind die lokale
   Passwortanmeldung und Payload-JWT-Authentifizierung deaktiviert. Bei fehlenden
   OAuth-Einstellungen bleibt die Anmeldung gesperrt; es gibt keinen automatischen
   Rückfall auf Passwortanmeldung.

Neue berechtigte Konten werden beim ersten Login in Payload angelegt. Die Zuordnung
erfolgt über die unveränderliche Supabase-Benutzer-ID. Existiert dieselbe E-Mail schon
in Payload, wird die Anmeldung mit einem Hinweis angehalten. Ein Betreiber muss das
bestehende CMS-Konto nach Prüfung beider Identitäten über die Payload Local API
(`payload.update`, Collection `users`, Feld `supabaseId`, `overrideAccess: true`)
explizit zuordnen. Eine automatische Zusammenführung über E-Mail findet nicht statt.
Das Zuordnungsfeld kann über Admin-UI und öffentliche API nicht geändert werden.

### Sitzung und Berechtigungen

- Authorization Code mit zufälligem State und PKCE S256; der Client-Secret wird nur
  beim serverseitigen Code-Austausch verwendet.
- Payload validiert den Access-Token am Supabase-UserInfo-Endpunkt und verlangt eine
  bestätigte E-Mail-Adresse. Die globale Backend-/Admin-Rolle wird bei jedem authentifizierten
  Request frisch abgefragt. Ein Rollenentzug oder Ausfall des Providers sperrt den
  Zugriff auch auf die CMS-API.
- Das CMS speichert den Access-Token verschlüsselt im HttpOnly-Cookie, maximal bis
  zum Tokenablauf und höchstens eine Stunde. Refresh-Tokens werden nicht gespeichert;
  danach ist ein erneuter Einstieg über Supabase erforderlich. Eine noch aktive
  Website-Sitzung kann dafür wiederverwendet werden. Payloads Refresh-Endpunkt
  verlängert diese Frist nicht und erstellt keinen separaten Payload-JWT.
- Die normale Payload-Abmeldung löscht das CMS-Cookie. Sie meldet nicht von der
  Website ab. `/me` und Refresh-Antworten geben keine Provider-Tokens aus.
- Ohne `SUPABASE_SSO_ENABLED=true` bleibt die bisherige lokale Anmeldung aktiv.
  Diese Einstellung ist eine bewusste Betriebsentscheidung, kein Fehler-Fallback.

### Prüfung

`npm run test:sso` prüft OAuth-Rückleitung, PKCE/State, Cookie-Manipulation,
Rollenentzug, Provider-Ausfälle, Kontozuordnung und Payload-Auth-Hooks mit simulierten
Provider-Antworten. Es werden keine echten Konten oder Datenbanken verändert.

Vor dem produktiven Einsatz mit dem konfigurierten Client prüfen: Login eines
berechtigten Kontos, Ablehnung ohne `backend`, CMS-Zugriff nach Rollenentzug,
Abmeldung und erneuter Login. Ein realer OAuth-Durchlauf benötigt die oben genannten
Zugangsdaten und eine erreichbare Website mit der Consent-Seite.

Referenzen: [Supabase OAuth-Ablauf](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows),
[Payload Custom Strategies](https://payloadcms.com/docs/authentication/custom-strategies).

## Local Werkbereich preparation (2026-10-03)

Pages now offer a Werkbereich selector (one page per area), a Steckbrief block
and an Ausstattung block. The canonical slug is `werkbereich-<area>`; legacy
aliases are normalized. The new migration is prepared, not deployed.

The original isolated preparation used `konglo_cms_workareas_local`.
Normal local editing now uses the shared production database described above.
Historical setup, sample-account details,
preview commands and integration checks are documented in the sibling frontend
README under “Run the isolated local preview”. The guarded scripts
`setup-local-editor.mjs` and `test-workarea-pages.mjs` refuse remote databases.
`test-workarea-migration.mjs` uses only `konglo_cms_workareas_migration_test`.


## Openinary media storage

The Media collection now uses a custom adapter built with Payload's
[`cloudStoragePlugin`](https://payloadcms.com/docs/upload/storage-adapters).
Configure server-only `OPENINARY_BASE_URL=https://media.konglomerat.org`,
`OPENINARY_API_KEY`, and `OPENINARY_FOLDER=konglo-cms` before deploying.
Both environments use the existing Openinary credentials and `konglo-cms`.
Previously imported files under `konglo-cms/local` remain valid shared assets.
Never expose the key through a `NEXT_PUBLIC_` variable.

New JPEG, PNG, WebP, AVIF, GIF, MP4, MOV and WebM uploads, including Payload's
resized image variants, go to Openinary. URLs use `/api/download/…` to serve stored
bytes without another transformation; animated GIFs retain their frames.
Folders contain a server-generated UUID for every upload/replacement. Metadata
edits preserve the existing path. Upload failures reject the save and preserve
the previous CMS record. The public media read policy is unchanged; creating,
editing and deleting CMS entries still requires authentication.

PDFs, SVGs and other file types outside this supported set stay in the persistent
`PAYLOAD_MEDIA_DIR` directory. Openinary's current upstream
[upload type list](https://github.com/openinary/openinary/blob/main/packages/core/src/utils/upload-validation.ts)
does not include documents such as PDFs; HEIC conversion also changes filenames,
so it is not enabled in this adapter. Existing local media keep their URLs and
are not silently moved. Keep the CMS media volume mounted. Replacing/deleting a
CMS entry retains original files, including Openinary assets, so links in other
published content remain valid. Cleanup is managed separately in the media
library.

`20261003_150000_openinary_media` adds only `media.prefix` and `media._objectkey`.
That migration is applied in production. Openinary credentials are configured
in the deployment environment as well as locally.

Integration test (uses a local HTTP Openinary fixture, never uploads to the live
service; requires the existing dedicated local CMS database):

```sh
POSTGRES_URL=postgres://utzel@127.0.0.1:5432/konglo_cms_workareas_local \
NEXT_PUBLIC_SERVER_URL=http://localhost:3106 \
PAYLOAD_SECRET=local-workarea-development-only \
node node_modules/payload/bin.js run scripts/test-openinary-storage.mjs
```

The test creates and removes its own media records and temporary files. It checks
variants/thumbnail URLs, metadata edits, duplicate filenames, replacements,
upstream failure rollback, animated GIFs, PDF fallback, anonymous access and
retention on deletion. `scripts/test-openinary-migration.mjs` separately checks
upgrade/rollback on `konglo_cms_workareas_migration_test` with `NODE_ENV=production`.

## 3D-Druck-Anleitung

Die CMS-Page `3d-druck-anleitung` wird im Frontend unter
`/werkbereiche/3d-druck/anleitung` angezeigt. Sie enthält die sieben Schritte,
Self-Service-Links sowie Software- und Video-Links. Auf der Hauptseite bleibt
ein CTA mit einer internen CMS-Seitenreferenz. Bestehende Blöcke werden dafür
wiederverwendet. `scripts/move-3d-printing-guide.mjs` führt die lokale Verschiebung
mit Backup und in einer Datenbanktransaktion aus; erneute Aufrufe überschreiben
die bearbeitete Anleitung nicht.

Ebenso liegt „Filament und Material“ als CMS-Page `3d-druck-material` unter
`/werkbereiche/3d-druck/material`. Die Hauptseite verlinkt sie mit
„Zur Materialübersicht“. Die geschützte lokale Verschiebung übernimmt
`scripts/move-3d-printing-material.mjs`; die Materialtexte bleiben erhalten.

Die CMS-Page `3d-druck-preise` liegt unter `/werkbereiche/3d-druck/preise`.
Sie enthält die Spendenempfehlung für Mitglieder, Preise für Druckaufträge,
das Kamera-Case-Rechenbeispiel inklusive Bildern und Modell-Link sowie die
Kontaktmöglichkeit für einen Druckauftrag. `scripts/move-3d-printing-prices.mjs`
verschiebt die bestehenden Blöcke lokal mit Backup und Datenbanktransaktion.
Auf der Hauptseite ersetzt „Zur Preisübersicht“ die ausführlichen Preisangaben.

## Inventar und Showcase nach Tag

Der vorhandene Block **Inventar / Showcase nach Tag** bietet unter
„Inhalte anzeigen“ die Auswahl zwischen Inventargegenständen und
Showcase-Projekten. Der Tag wird vollständig, ohne Beachtung von
Groß-/Kleinschreibung verglichen. Projekte müssen explizit öffentlich sein
(`is_private = false`), wie auf der Showcase-Übersicht. Projektkarten verlinken
auf `/showcase/<slug>`, Inventarkarten auf `/resources/<slug>`.
Die 3D-Druck-Seite verwendet `3ddrucker` für Geräte und `3d-druck` für Projekte.
`scripts/set-3d-related-projects.mjs` ergänzt den Projektblock nach der
Geräteliste in der isolierten lokalen Datenbank.

## Sidebar der Werkbereichsseiten

Unter **Pages → Werkbereich-Seite → Sidebar** lassen sich die vorhandenen
Seitenblöcke hinzufügen und sortieren. `sidebarLayout` verwendet dieselben
Blockdefinitionen wie `layout`; die Speicherung unterscheidet beide Bereiche
über den vorhandenen Blockpfad, ohne neue Blocktypen oder Tabellen.
Die Sidebar steht im Frontend auf großen Bildschirmen rechts, auf kleineren
unter dem Hauptinhalt. Ein leerer Sidebar-Bereich zeigt den Kalender.
Der vorhandene Live-Inhalt „Nächste Termine“ wird in der Sidebar automatisch
nach dem Werkbereich der Seite gefiltert. Die Zuordnung verwendet Hashtags im
Kalendereintrag, bei fehlenden Bereichs-Tags eindeutige Titelbegriffe.
Die offene Laserwerkstatt ist auch dem gemeinsam betreuten 3D-Druck zugeordnet;
explizite VHC-Termine bleiben beim VHC. Ohne passende Termine erscheint ein
Leerzustand. Außerhalb der Sidebar bleibt der Vereinskalender ungefiltert.

Laser und 3D-Druck wurden lokal mit `scripts/set-workarea-sidebars.mjs`
befüllt. Der Datenbanktest `scripts/test-workarea-sidebars.mjs` prüft getrennte
Speicherung, Umsortieren und unabhängige Änderungen beider Inhaltsbereiche.
Beide Skripte verweigern Zugriffe außerhalb der lokalen Werkbereich-Datenbank:

```sh
node --env-file=.env.development.local node_modules/payload/bin.js run scripts/test-workarea-sidebars.mjs
```

Im Kontaktblock kann „Inventar-Ort oder Karten-Link“ einen Inventarpfad wie
`/resources/laser-und-3d-druckwerkstatt` enthalten. Das Frontend zeigt dann den
öffentlichen Ort mit aktuellem Namen, Kartenposition und Raumumriss aus dem
Inventar sowie einem Routen-Link. Externe Karten-Links bleiben normale Links.
`scripts/set-workarea-location-maps.mjs` richtet dies lokal für Laser und
3D-Druck ein und sichert die bisherigen Seiten vor der Änderung.

Inventarblöcke bieten unter „Einträge pro Zeile“ die Größen 2, 3 und 4 an.
Schmale Bildschirme reduzieren die Spaltenzahl; die Sidebar bleibt einspaltig.
„Zubehör und Filament trocknen“ nutzt den Tag `3D-Druck Zubehör` und 3 Einträge
pro Zeile (`scripts/set-3d-accessories-inventory.mjs`).

## Lokales CMS mit Live-Supabase-Anmeldung

### Inlineeditor im Frontend

Der Frontend-Editor verwendet die Endpunkte `GET/PATCH /api/inline-pages/:id`.
Jeder Aufruf prüft den Supabase-Bearer-Token über `/auth/v1/user` und die aktuellen
globalen Rollen `backend`/`admin` unter der RLS des Benutzers. Nur bestehende
CMS-Berechtigungen werden verwendet. Schreiben erfolgt mit Payload-Zugriffsprüfung,
Versionierung und einer Postgres-Transaktion mit Zeilensperre. Ein Inhalts-Hash
verhindert das Überschreiben zwischenzeitlicher Änderungen. Automatisch erzeugte
Block-IDs werden dabei ignoriert, relationale IDs bleiben Teil des Vergleichs.
Der Endpunkt akzeptiert nur Titel, Hero, Content, Sidebar und Metadaten;
Slug, Rollen und Collection-Konfiguration können darüber nicht verändert werden.

Der Frontend-Proxy hält Tokens auf dem Server und invalidiert nach dem Speichern
den `payload-cms`-Cache. Beide Anwendungen müssen für diese Funktion gemeinsam
aktualisiert werden. Es ist kein zusätzlicher administrativer API-Schlüssel nötig.

Prüfung: `node --test scripts/test-inline-pages.mjs scripts/test-supabase-sso.mjs`.

### Lokaler Start

Start: `npm run dev:local`, dann `http://localhost:3106/admin/login` öffnen.
Die nicht versionierte `.env.development.local` enthält die gemeinsame CMS-Datenbank über SSH,
den lokalen Payload-Schlüssel und die OAuth-Konfiguration. Next.js lädt diese
Datei automatisch im Entwicklungsmodus.

Die Anmeldung verwendet das bestehende Live-Supabase und dessen globale
Backend-/Admin-Berechtigungen. Der separate vertrauliche OAuth-Client
„Konglomerat CMS lokal“ hat ausschließlich die Rückleitung
`http://localhost:3106/api/sso/callback`. CMS-Inhalte werden in derselben
produktiven Datenbank `konglo_cms` gespeichert. Der lokale Passwort-Testzugang ist
bei aktiviertem SSO deaktiviert. Die Anmeldung immer über `localhost` starten,
damit die Cookies zur registrierten Rückleitung passen.
