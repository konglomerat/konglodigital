# OpenInventory display on Konglodigital

`/resources` and its detail pages read the Konglomerat organization in
https://inventar.konglomerat.org through the server-side v1 API. The existing
Konglodigital login requirement remains in place, including both JSON and media
endpoints. The browser receives an explicit catalog field allowlist, never the
upstream token, notes, actor identities, financial data or arbitrary custom fields.

Set `OPENINVENTORY_API_TOKEN` in the application's server environment. Create a
standalone organization token with **only the `read` scope** in OpenInventory.
Do not prefix it with `NEXT_PUBLIC_`, commit it or place it in a URL. The upstream
origin is fixed in `src/lib/openinventory-contract.ts`; requests cannot select a
different upstream host, follow redirects or proxy arbitrary files.

Lists fetch all API pages (500 per upstream request), then apply search/type
filters and 100-item display pagination. Maps include every positioned item,
including those outside the first list page. Server caching revalidates after
15 seconds. Reload/revisit to see recent changes. An upstream outage shows an
error; there is no fallback to obsolete Supabase inventory records.

The media route checks the Konglodigital session and the file's membership in
its resource, streams byte ranges, and supports bounded image thumbnails. Video
preview and poster files retain their associations and do not appear as duplicate
gallery entries. No integration response may be publicly cached.

OpenInventory slugs and IDs work on the old detail route. Historical Unicode
aliases resolve through the existing Supabase alias table to an ID; all content
is still read from OpenInventory. The legacy database remains intact. Showcases
continue using their existing storage, editing paths and resource selector.
The legacy `/api/campai/resources` GET remains for that selector because its
relationships have foreign keys into the existing Supabase catalog.

Create/edit/map/duplicate entry points redirect to OpenInventory. Legacy inventory
writes and Campai sync/rental actions are disabled. Shared showcase create/update/
delete/cover/map endpoints continue allowing only `project` records.

## Deployment and rollback

This scoped change starts at production commit
`03f186a721e96617382786b9abe7d36e9956ba2a`. Its release branch is
`codex/openinventory-display`, with a PR into `main`. Dokploy's application
`hE8YNTWHKxEJKdw170Gn2` is pinned to that release branch for this deployment so
unrelated changes from `main` or the local ongoing merge are not deployed.
After merging this PR, switch Dokploy's Git branch back to `main` when its other
changes are also ready to release.

The previous application configuration and integration token are backed up locally
under `~/.config/openinventory/digital-api-integration/` with owner-only permissions.
Rollback by redeploying the previous image/configuration; do not delete or rewrite
inventory data. Revoke the integration token when retiring this connection.

Validation: `npm test`, `npx tsc --noEmit`, `npm run build`; authenticated live UI
checks for list/search/detail/map/media, anonymous API rejection, and editor links.
