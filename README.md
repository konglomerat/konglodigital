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

### Campai Invoice Drafts

- CAMPAI_API_KEY
- CAMPAI_ORGANIZATION_ID
- CAMPAI_MANDATE_ID
- CAMPAI_ACCOUNT
- CAMPAI_INVOICE_ACCOUNT (optional; Sachkonto for invoice positions, falls back to CAMPAI_ACCOUNT)
- CAMPAI_COST_CENTER1
- CAMPAI_ACCOUNT_NAME (optional)
- CAMPAI_DUE_DAYS (optional, default 14)

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

To allow creating and updating resources (including image uploads), configure:

- SUPABASE_RESOURCES_BUCKET (optional, defaults to `resources`; bucket must be public for images to load in the app)
- SUPABASE_SERVICE_ROLE_KEY (required for server-side storage uploads)
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

Deploy on Vercel or any Node.js host that supports Next.js App Router.
Configure the same environment variables in your hosting provider.

## i18n

The app now uses i18next with German (`de`) as default and English (`en`) behind `/en` routes.

- Use `tx("Source string", "de" | "en")` in components to mark translatable strings.
- `npm run i18n:extract` writes or updates locale source files from these calls.
- `npm run i18n:translate` uses `OPENAI_API_KEY` and model `I18N_TRANSLATE_MODEL` (default `gpt-4.1-mini`) to generate translations.

## Inspiration

https://www.maker-space.de/maschinen/
