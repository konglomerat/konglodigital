KongloDigital is a Next.js app that shows a dashboard of BambuLab cloud printers and their current status.

## Getting Started

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

Open http://localhost:3000 to view the dashboard.

## Data Source

The dashboard fetches live data from the BambuLab cloud API and MQTT broker.
Set the following environment variables in .env.local:

- BAMBULAB_ACCESS_TOKEN (recommended)
- BAMBULAB_UID (optional; derived from the preference API if omitted)
- BAMBULAB_EMAIL (only if you want to login instead of providing a token)
- BAMBULAB_PASSWORD (password login)
- BAMBULAB_VERIFICATION_CODE (email code login)
- BAMBULAB_MQTT_HOST (optional; defaults to us.mqtt.bambulab.com)

Supabase (for print job notes):

- SUPABASE_URL
- SUPABASE_ANON_KEY

If BAMBULAB_ACCESS_TOKEN is not provided, the server will log in using the
email/password or verification code and cache the token in memory until it
expires.

## Supabase Descriptions

Run the SQL in [supabase/schema.sql](supabase/schema.sql) to create the
print_job_descriptions table and enable row-level security. All authenticated
users can view descriptions. The first user who saves a description claims
ownership and can edit it later.

## Supabase Auth

Enable Email/Password auth in your Supabase project and create at least one
user. The dashboard is protected by middleware and will redirect to /login.

## API Endpoints

The UI loads data via API routes:

- GET /api/bambu/printers
- GET /api/bambu/jobs
- GET /api/descriptions
- POST /api/descriptions
- POST /api/auth/signin
- POST /api/auth/signout

## Campai Invoice Drafts

Add the following environment variables to .env.local:

- CAMPAI_API_KEY
- CAMPAI_ORGANIZATION_ID
- CAMPAI_MANDATE_ID
- CAMPAI_ACCOUNT
- CAMPAI_COST_CENTER1
- CAMPAI_ACCOUNT_NAME (optional)
- CAMPAI_DUE_DAYS (optional, default 14)

## Campai Products

The products page fetches items from Campai via `/api/campai/products`.
By default it uses the Campai endpoint:
`/finance/products/list` (POST)
Optionally set `CAMPAI_PRODUCTS_ENDPOINT` to override the Campai products URL.

## Development Notes

- Main UI: src/app/page.tsx
- Mock data: src/lib/bambu.ts

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
