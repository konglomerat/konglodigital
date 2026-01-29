# KongloDigital

KongloDigital is a Next.js dashboard for BambuLab printers and print jobs. It
aggregates printer status, live job telemetry, and per-job notes backed by
Supabase.

## Features

- Live printer status from the BambuLab cloud API + MQTT
- Print job dashboard with description/notes
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
- CAMPAI_COST_CENTER1
- CAMPAI_ACCOUNT_NAME (optional)
- CAMPAI_DUE_DAYS (optional, default 14)

### Campai Products

The products page fetches items via `/api/campai/products`.
By default it uses the Campai endpoint `/finance/products/list` (POST).
Optionally set `CAMPAI_PRODUCTS_ENDPOINT` to override the products URL.

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

## Scripts

- `npm run dev` — start dev server
- `npm run build` — build for production
- `npm run start` — start production server
- `npm run lint` — lint codebase

## Deployment

Deploy on Vercel or any Node.js host that supports Next.js App Router.
Configure the same environment variables in your hosting provider.
