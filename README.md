# KongloDigital

KongloDigital is the web dashboard that powers the digital workshop experience
for konglomerat.org. It brings together 3D printing operations, the member
shop, and the shared resource inventory in one place. The app aggregates live
printer status, print-job telemetry, and per-job notes, while also integrating
Campai for products and invoices and Supabase for authentication and data.

## Features

- Live printer status from the BambuLab cloud API + MQTT
- Print job dashboard with description/notes
- Member shop and checkout powered by Campai
- Resource inventory (Inventar) with location mapping
- Auth-protected UI via Supabase
- Campai integration for products and invoice drafts
- End-to-end room requests for the Neues Volkshaus Cotta, including pricing,
  contract signatures and Campai invoice creation

## Tech Stack

- Next.js App Router
- React 19
- Supabase (auth + data)
- BambuLab cloud API + MQTT

## Getting Started

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Environment Variables

Create a `.env.local` file and add the following as needed.

### BambuLab

- BAMBULAB_ACCESS_TOKEN (recommended)
- BAMBULAB_UID (optional; derived from the preference API if omitted)
- BAMBULAB_EMAIL (only if you want to login instead of providing a token)
- BAMBULAB_PASSWORD (password login)
- BAMBULAB_VERIFICATION_CODE (email code login)
- BAMBULAB_MQTT_HOST (optional; defaults to us.mqtt.bambulab.com)

If `BAMBULAB_ACCESS_TOKEN` is not provided, the server logs in using
email/password or verification code and caches the token in memory until it
expires.

### Supabase (job descriptions)

- SUPABASE_URL
- SUPABASE_ANON_KEY

Run the SQL in [supabase/schema.sql](supabase/schema.sql) to create the
`print_job_descriptions` table and enable row-level security.

### Supabase Auth

Enable Email/Password auth in your Supabase project and create at least one
user. The dashboard is protected by middleware and will redirect to `/login`.

### Content pages from Payload CMS

The production CMS is `https://backend.konglomerat.org` (editor: `/admin`).
Set `PAYLOAD_CMS_URL=https://backend.konglomerat.org` (without a trailing slash). Published entries in its existing `Pages`
collection are used for these routes:

- `/`: `startseite` (preferred) or `home`
- `/verein`: `verein` (preferred) or `ueber-uns`
- `/werkbereiche`: `werkbereiche` (preferred) or `werkstattbereiche`
- `/monatsbeitrag`: `monatsbeitrag` (preferred) or `zugangskarte`; its blocks
  are shown as supporting information below the interactive card selector
- `/werkbereiche/<slug>`: one Pages document per Werkbereich, stored as
  `werkbereich-<slug>`. Legacy `werkbereiche-<slug>` and known bare area slugs
  remain readable; editing in the updated CMS normalizes their names.

The integration renders the existing Page builder blocks for hero content,
content columns, media, calls to action, post archives, and forms. The Konglo
extension also supports download lists, galleries, logo grids, HTTPS embeds,
contact boxes, accordions/glossaries, statistics, card grids, and live-content
slots for calendars and home-page feeds. Drafts stay private in Payload; the
website only requests published documents. If the CMS is not configured,
unavailable, or has no matching published page, the shared fallback remains
visible. Werkbereiche use one template; the old Holz demo and separate 3D page
are replaced by reusable blocks. Existing printer tools remain linked. Live areas such as the Verein calendar, home page feeds,
Werkbereich tiles, and the Monatsbeitrag selector stay connected to their
application data and are combined with the CMS content.

#### Create a public subpage in the backend

In the Konglo Payload backend (`../konglo`), open **Pages → Create New**:

1. Set a title and a single-segment slug, such as `kontakt`, `mitglied-werden`,
   `kosten`, `workshops`, `begriffe`, `impressum`, or `datenschutz`.
2. Compose the page in **Hero** and **Content** using the existing blocks:
   text columns, images, buttons, forms, downloads, galleries, contact details,
   accordions, cards, or live content. Set the title, description, and image in
   **SEO** when needed.
3. Save as a draft while editing, then **Publish**. A published `kontakt` page
   appears at `/kontakt` without adding code or rebuilding the frontend.
   Published changes are revalidated after 60 seconds on the next request;
   a previously cached response may be served while the refresh completes.
   Missing and unpublished pages return 404.
4. Link the page under **Hauptmenü** or **Footer** using an internal page
   reference, or from a button, text, or card block on another page.

#### Edit the main menu and footer

The existing Payload globals **Hauptmenü** (`header`) and **Footer** (`footer`)
control the public navigation. Add up to six links, choose a published Page
or an external URL, set a label and optionally **Open in new tab**, then save.
Reordering the rows changes their order on the website. The main menu is shared
between desktop and mobile; authenticated app shortcuts remain available separately.
Internal navigation links follow the current German/English URL prefix.

Both globals are fetched anonymously via `/api/globals/header?depth=1` and
`/api/globals/footer?depth=1`, using the same `PAYLOAD_CMS_URL` as content pages.
They revalidate after 60 seconds on the next request. Missing configuration,
HTTP errors, malformed responses, or a CMS timeout retain the existing default
navigation independently for each global. A saved empty `navItems` array
intentionally hides that menu's public links. Unpublished or unresolved page
references and unsafe links are omitted. Only authenticated CMS editors can
update these globals.

The existing schema is reused, so this navigation connection needs no database
migration. Deploy the frontend changes and backend editor descriptions, configure
`PAYLOAD_CMS_URL`, then verify a published test Page through both menus. The CMS
frontend/preview remains on its own origin; the setting must be the CMS origin,
not the public Digital app or its `/admin` path.

The existing `/verein`, `/werkbereiche`, `/monatsbeitrag`, and home-page routes
keep their application components. CMS references to `home`/`startseite`,
`ueber-uns`, `werkstattbereiche`, and `zugangskarte` resolve to those existing
routes. Application routes such as `/register`, `/login`, `/account`, `/admin`,
`/showcase`, and `/calendar` take precedence and cannot be replaced by a CMS page.
In particular, `/mitglied-werden` uses its published editorial page when available
and otherwise redirects to the existing membership page on konglomerat.org in
the selected language. `/register` continues to activate digital accounts for
existing members. A membership application
form must be configured separately; creating the page does not itself enroll members.

The account activation route uses the same `campai-contact-directory` API as
the member administration. The member profile, tariff changes, departments,
and Ehrenamtsbonus self-services from `topnav-restructure` remain available
alongside the CMS pages.

Before using Ehrenamtsbonus on an existing database, apply the pending
`20260829120000_ehrenamtsbonus.sql` migration and then
`20261004100000_ehrenamtsbonus_cancellation.sql` (in migration order). The latter
adds the cancellation columns and status required by the current application;
the original migration alone is insufficient. The combined source schema also
contains these fields. Merging the code does not apply database migrations.

Additional Werkbereich pages can use `werkbereich-<slug>` and are reachable at
`/werkbereiche/<slug>` even before being added to the central Werkbereich list.
Use a card or page reference to make these discoverable; the existing overview
and side navigation still use `src/lib/werkbereiche.ts`.

The frontend needs `PAYLOAD_CMS_URL` pointing to that backend. Public reads use
no CMS credentials and explicitly request published documents. The backend's
existing preview remains available there; this integration does not expose
drafts on Konglo Digital. `/en/<slug>` currently renders the same CMS content
because the existing backend Pages fields are not localized.

Run the isolated CMS routing, navigation, and publication checks with
`node --test scripts/payload-pages.test.mjs`.

The repeatable import helper previews changes by default and never overwrites
an existing slug:

- Preview from the Payload project directory:
  `pnpm payload run /path/to/konglodigitalewerkstaetten/scripts/migrate-static-content-to-payload.mjs`
- Create missing pages as drafts:
  `pnpm payload run /path/to/konglodigitalewerkstaetten/scripts/migrate-static-content-to-payload.mjs write`
- Add `publish` as a second argument only when the imported pages should go
  live immediately.

### Campai Invoice Drafts

- CAMPAI_API_KEY
- CAMPAI_ORGANIZATION_ID
- CAMPAI_MANDATE_ID
- CAMPAI_ACCOUNT
- CAMPAI_INVOICE_ACCOUNT (optional; Sachkonto for invoice positions, falls back to CAMPAI_ACCOUNT)
- CAMPAI_COST_CENTER1
- CAMPAI_ACCOUNT_NAME (optional)
- CAMPAI_DUE_DAYS (optional, default 14)

### Neues Volkshaus Cotta room bookings

Run the SQL in [supabase/schema.sql](supabase/schema.sql) after updating the
application. It creates `volkshaus_booking_requests` and
`volkshaus_booking_events`.

- `CAMPAI_VOLKSHAUS_COST_CENTER2` (required before VHC invoices can be created)
- `SUPABASE_SERVICE_ROLE_KEY` (required for server-side booking persistence)
- `NEXT_PUBLIC_SITE_URL` (recommended in production; canonical origin used in
  personal request and contract links)
- `VOLKSHAUS_CAMPAI_FINALIZE_INVOICE` (optional; `false` by default, so the
  integration creates a Campai draft)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` (required to send
  request and contract emails; port `587` uses STARTTLS and port `465` uses
  implicit TLS)
- `SMTP_SENDER_NAME` (optional; display name, defaults to `SMTP_USER`)
- Volkshaus staff notifications go to `mitmachen@neuesvolkshaus.de` when a
  customer submits a request or signs the contract. Staff actions do not trigger
  these notices. This address is also used as the reply-to for Volkshaus emails;
  the platform-wide `SMTP_ADMIN_EMAIL` does not control this workflow. Staff
  notification delivery results are recorded in `volkshaus_booking_events`.
- `VOLKSHAUS_AUDIT_SALT` (recommended; salts the pseudonymized signature audit
  value)
- `VOLKSHAUS_BOOKING_STORAGE=memory` (development only; uses volatile in-memory
storage instead of Supabase)
- `TEAMUP_API_KEY` (required; server-side API key for Teamup Calendar)
- `TEAMUP_READ_CALENDAR_KEY` (required; active read-only Teamup calendar-link
  key; keep it server-side and limit it to the VHC room calendars)
- `TEAMUP_WRITE_CALENDAR_KEY` (required for booking synchronization; active
  Teamup calendar-link key with modify permission, restricted to the three VHC
  room calendars)

At least one staff account needs `role = 'admin'` in `public.user_access` to
process requests in `/admin/volkshaus`.

The VHC admin has an overview, a shared booking/price editor and a contract/history
view. The editor preserves the agreed price unless staff explicitly recalculates
it, accepts individual net positions or a target gross total, and separates invoice
wording/recipient from internal change notes. Saves check the booking revision;
reserved date/room changes check availability and synchronize Teamup.

Editorial invoice settings, the original price, change history and archived
contract snapshots/signatures are stored in `price_snapshot.admin` (existing JSONB;
no new database columns). Public price and contract builders remove this private
metadata. Previous contracts remain downloadable by version through the existing
customer access link. Signing requires the displayed contract hash. Contract-affecting
edits create a new draft while retaining the previous signed version; invoice-only
wording changes do not require another contract signature.

Invoices are now created explicitly by staff after signature, not automatically
when the customer signs. Existing Campai receipts are never silently replaced:
subsequent edits create a visible correction task. Staff performs the correction
in Campai and records its receipt reference/result in the history. That manual
confirmation does not change the remote receipt or its payment status. Creating
new invoices still honors `VOLKSHAUS_CAMPAI_FINALIZE_INVOICE`.

Run `node --test scripts/volkshaus-admin-edit.test.mjs` for isolated price,
revision, authorization, concurrency, calendar and invoice-payload checks. These
tests use synthetic data and do not send email or write to external services.

Availability is read from Teamup Calendar and merged with existing confirmed
and unexpired held requests. The Teamup sub-calendars are mapped as follows:

- Veranstaltungssaal (`11786455`) -> `saal`
- Stube (`11786456`) -> `stube`
- Garten (`11786506`) -> `garten`

The public booking UI fails closed if Teamup cannot be reached; it does not
fall back to synthetic availability data.

When staff places a request on hold, the concrete requested appointment is
created or updated in Teamup using a stable remote id. Signing the contract and
completing the booking update its status; rejecting or cancelling it removes
the Teamup event. Regular offers currently synchronize only the concrete date
entered in the request because additional occurrence dates are not collected.

### Campai Expense Receipts (Eigenbeleg)

- CAMPAI_CREDITOR_ACCOUNT (required; valid Kreditorenkonto for expense receipts)
- CAMPAI_EXPENSE_ACCOUNT (optional; Sachkonto for positions, falls back to CAMPAI_ACCOUNT)
- CAMPAI_COST_CENTER1 (required in setups with Sphären; numeric positive integer)
- CAMPAI_RECEIPT_FILE_UPLOAD_ENDPOINT (optional; override for Campai file upload endpoint used to attach generated PDF)

Hinweis: Für Dateianhänge wird primär `GET /api/storage/uploadUrl` von Campai genutzt,
anschließend wird die Datei auf die zurückgegebene URL hochgeladen und die `id` als
`receiptFileId` beim Receipt gesetzt.

### Einkaufen

The products page fetches items via `/api/campai/products`.
By default it uses the Campai endpoint `/finance/products/list` (POST).
Optionally set `CAMPAI_PRODUCTS_ENDPOINT` to override the products URL.

### Inventar

The resources page fetches items via `/api/campai/resources`.
Resources are stored in the Supabase `resources` table.

To feature a resource on the public homepage in the "Resource of the month"
section, add the tag `resourceofthemonth` to that resource. If multiple
resources use the tag, the homepage prefers the highest `priority` value and
then the most recently updated entry.

To allow creating and updating resources (including media uploads), configure:

- OPENINARY_BASE_URL (Openinary instance used for resource media uploads and cached image transformations)
- OPENINARY_API_KEY (server-only API key for Openinary media uploads)
- SUPABASE_SERVICE_ROLE_KEY (required for server-side resource writes and legacy storage cleanup)
- OPENAI_API_KEY (required to generate descriptions from images)
- OPENAI_BASE_URL (optional, for OpenAI-compatible providers)
- OPENAI_IMAGE_EDIT_MODEL (optional, defaults to `gpt-image-1`)
- IMAGE_EDIT_PROVIDER (optional, `google` or `openai`; defaults to `google`)
- GOOGLE_AI_API_KEY or GOOGLE_API_KEY (optional; required if IMAGE_EDIT_PROVIDER=google and no OPENAI_API_KEY fallback)
- GOOGLE_GEMINI_IMAGE_MODEL (optional, Gemini model id for image edits; defaults to `gemini-3-pro-image-preview`)

## API Routes

- GET `/api/bambu/printers`
- GET `/api/bambu/jobs`
- GET `/api/descriptions`
- POST `/api/descriptions`
- POST `/api/auth/signin`
- POST `/api/auth/signout`

## Development Notes

- Main UI: `src/app/page.tsx`
- Mock data: `src/lib/bambu.ts`

### UI Components

Use `Button` from `src/app/components/Button.tsx` for any button-like UI.
It supports the `kind` variants `primary`, `secondary`, `danger-primary`, and
`danger-secondary`. If you pass `href`, it renders an anchor element; otherwise
it renders a native button. Use it for Links styled as buttons to keep styling
consistent.

## Scripts

- `npm run dev` — start dev server
- `npm run build` — build for production
- `npm run start` — start production server
- `npm run lint` — lint codebase
- `npm run i18n:extract` — extract `tx("...")` strings into `src/i18n/locales/de.json` and `src/i18n/locales/en.json`
- `npm run i18n:translate` — auto-translate extracted keys with GPT into `src/i18n/generated/de.json` and `src/i18n/generated/en.json`
- `npm run i18n:sync` — run extract + GPT auto-translation in sequence
- `npm run storage:png-to-jpg` — convert PNG files in Supabase Storage to JPG (quality 60), delete original PNG files, and update `resources.image` / `resources.images` DB references

### Storage migration script

The PNG-to-JPG script uses:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_RESOURCES_BUCKET` (optional; defaults to `resources`)
- `SUPABASE_STORAGE_OBJECT_PUBLIC_BASE_URL` (optional; override public object URL base for self-hosted setups)
- `SUPABASE_STORAGE_RENDER_PUBLIC_BASE_URL` (optional; override public render URL base for self-hosted setups)

Example usage:

- Dry run: `node --env-file=.env.local scripts/convert-supabase-png-to-jpg.mjs --dry-run`
- Execute migration: `node --env-file=.env.local scripts/convert-supabase-png-to-jpg.mjs`
- Only inside a folder: `node --env-file=.env.local scripts/convert-supabase-png-to-jpg.mjs --prefix=uploads/2026`
- Skip DB updates: `node --env-file=.env.local scripts/convert-supabase-png-to-jpg.mjs --skip-db`

### Supabase cutover smoke check

Use this after pointing env vars to your new self-hosted instance:

- `npm run supabase:smoke`

The check verifies:

- service-role auth admin access
- database access to `resources`
- storage access to `SUPABASE_RESOURCES_BUCKET`

### Supabase source->target migration helpers

Use these scripts to migrate and verify during cutover from hosted Supabase to self-hosted Supabase.

Required env vars:

- `SOURCE_SUPABASE_URL`
- `SOURCE_SUPABASE_SERVICE_ROLE_KEY`
- `TARGET_SUPABASE_URL`
- `TARGET_SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_RESOURCES_BUCKET` (optional; defaults to `resources`)

Compare source and target parity:

- `npm run supabase:compare`
- Custom tables: `npm run supabase:compare -- --tables=resources,resource_links`

Sync storage bucket files from source to target:

- Dry run: `npm run supabase:storage-sync -- --dry-run`
- Execute (copy only missing): `npm run supabase:storage-sync`
- Execute and overwrite existing files: `npm run supabase:storage-sync -- --overwrite`
- Restrict to a prefix: `npm run supabase:storage-sync -- --prefix=uploads/2026`

Sync database tables from source to target:

- Dry run: `npm run supabase:table-sync -- --tables=resources --dry-run`
- Execute: `npm run supabase:table-sync -- --tables=resources`
- Multiple tables: `npm run supabase:table-sync -- --tables=resources,print_job_descriptions`

## Deployment

Deploy on Dokploy or any Node.js host that supports Next.js App Router.
Configure the same environment variables in your hosting provider.

## i18n

The app now uses i18next with German (`de`) as default and English (`en`) behind `/en` routes.

- Use `tx("Source string", "de" | "en")` in components to mark translatable strings.
- `npm run i18n:extract` writes or updates locale source files from these calls.
- `npm run i18n:translate` uses `OPENAI_API_KEY` and model `I18N_TRANSLATE_MODEL` (default `gpt-4.1-mini`) to generate translations.

## Inspiration

https://www.maker-space.de/maschinen/

#### Werkbereiche: one page, reusable blocks

In **Pages**, choose **Werkbereich** in the sidebar. The CMS assigns the canonical
slug automatically and rejects a second page for that area, including drafts,
duplicated pages and old slug aliases. Ordinary content pages leave this field
empty. The 16 area IDs in the backend must match `src/lib/werkbereiche.ts`.

Use **Werkbereich: Steckbrief** for location, access/instruction, opening times,
and costs/material. Empty facts are hidden. **Werkbereich: Ausstattung** provides
a list of machines/tools, descriptions and prerequisites. These are editorial
facts, not live inventory statuses. Add existing Gallery, Downloads, Contact,
Accordion and Card Grid blocks as needed; reorder everything on the same page.
3D printer tools are linked from a Card Grid. Each page owns its block contents;
block types are reusable, changes to one area's text do not alter another area.

The prepared local database contains all 16 pages. Holz and 3D-Druck are published
**only locally** with visibly labelled sample content; the other 14 are drafts.
Real locations, prices, times, equipment and contacts still need editorial input.

#### Run the isolated local preview

The local database is `konglo_cms_workareas_local` on local PostgreSQL. Never use
the backend's production `.env` database for local development. Start the CMS
from `../konglo` with explicit local overrides (replace `utzel` with your local
PostgreSQL user if needed):

```sh
POSTGRES_URL=postgres://utzel@127.0.0.1:5432/konglo_cms_workareas_local \
NEXT_PUBLIC_SERVER_URL=http://localhost:3106 \
PAYLOAD_SECRET=local-workarea-development-only \
node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3106
```

From this frontend directory:

```sh
PAYLOAD_CMS_URL=http://localhost:3106 NEXT_DIST_DIR=.next/werkbereiche-preview \
node node_modules/next/dist/bin/next dev --hostname localhost --port 3105
```

- Preview: `http://localhost:3105/werkbereiche/holz` and `/werkbereiche/3d-druck`.
- Local editor: `http://localhost:3106/admin`.
- Synthetic local test account: `local-preview@example.test`, password
  `Konglo-local-preview-3106!`. This account exists only in the isolated local DB.
- Seed: run `scripts/prepare-werkbereich-pages.mjs` through the backend Payload
  CLI from `../konglo`, using the same explicit local environment variables.
  Without `write` it previews; with `write` it creates only missing drafts and
  never overwrites existing content. It refuses any other database.
- Frontend checks: `node --test scripts/payload-pages.test.mjs`.
- Backend checks: `scripts/test-workarea-pages.mjs` through the Payload CLI,
  using the same local DB overrides and `NODE_ENV=production` (disables schema
  push). It updates only the named local fixture DB.

The backend migration `20261003_140000_werkbereich_pages` is prepared but has
**not** been applied to production. Its upgrade and rollback were exercised on
`konglo_cms_workareas_migration_test`, a separate local test copy. A legacy
collision aborts the migration transaction; resolve those content duplicates
before a future deployment. No deployment is part of this preparation.


The CMS Media collection is also prepared to use `media.konglomerat.org` for new
supported image and video uploads, including thumbnails. Absolute Openinary URLs
already work in this frontend's CMS blocks. Documents such as PDFs and legacy
media keep the existing CMS storage path. See the backend README's “Openinary
media storage” section for configuration, retention and the local integration
tests. This change is prepared locally and has not been deployed.
