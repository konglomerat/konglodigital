import env from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

env.loadEnvConfig(process.cwd());
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const rows = [];
for (let offset = 0; ; offset += 500) {
  const { data, error } = await client.from('resources').select('*').ilike('type', 'project').order('id').range(offset, offset + 499);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 500) break;
}
const ids = new Set(rows.map(row => row.id));
const links = [];
for (let offset = 0; ; offset += 500) {
  const { data, error } = await client.from('resource_links').select('*').order('resource_a').order('resource_b').range(offset, offset + 499);
  if (error) throw error;
  links.push(...data.filter(link => ids.has(link.resource_a) || ids.has(link.resource_b)));
  if (data.length < 500) break;
}
const referenceIds = [...new Set([...links.flatMap(link => [link.resource_a, link.resource_b]), ...rows.map(row => row.workshop_resource_id)].filter(Boolean))];
const { data: references, error } = referenceIds.length
  ? await client.from('resources').select('id,name,pretty_title,image,images').in('id', referenceIds)
  : { data: [], error: null };
if (error) throw error;
const authors = {};
for (const ownerId of new Set(rows.map(row => row.owner_id).filter(Boolean))) {
  const [{ data: account, error: accountError }, { data: profile, error: profileError }] = await Promise.all([
    client.auth.admin.getUserById(ownerId),
    client.from('member_profiles').select('campai_name,avatar_url,short_bio').eq('user_id', ownerId).maybeSingle(),
  ]);
  if (accountError || profileError) throw accountError || profileError;
  const metadata = account.user?.user_metadata || {};
  // Only public display information is exported; never credentials or member contact details.
  authors[ownerId] = {
    name: profile?.campai_name || metadata.full_name || metadata.campai_name || metadata.name || metadata.display_name || [metadata.first_name, metadata.last_name].filter(Boolean).join(' ') || 'Mitglied',
    bio: profile?.short_bio || metadata.short_bio || metadata.bio || metadata.about || null,
    avatarUrl: profile?.avatar_url || metadata.avatar_url || metadata.picture || null,
  };
}
const target = process.argv[2] || `.migration-backups/showcases-${Date.now()}.json`;
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, JSON.stringify({ exportedAt: new Date().toISOString(), rows, links, references, authors }, null, 2), { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ target, total: rows.length, public: rows.filter(row => row.is_private === false).length, nonPublic: rows.filter(row => row.is_private !== false).length }));
