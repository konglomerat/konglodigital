import assert from 'node:assert/strict';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// Uses an isolated local PostgreSQL cluster with Unix sockets only. Never reads
// .env or connects to the project's Supabase database. Skips if tools are absent.
let binaries;
try { binaries = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
catch { /* PostgreSQL is optional on developer machines. */ }
test('database enforces private storage, exclusive leases and exactly one durable start intent', { skip: !binaries }, async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'konglo-pg-'));
  const pg = name => path.join(binaries, name);
  const cluster = path.join(directory, 'data');
  let started = false;
  const args = ['-h', directory, '-p', '55439', '-U', os.userInfo().username, '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'];
  const sql = command => execFileSync(pg('psql'), [...args, '-c', command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    execFileSync(pg('initdb'), ['-D', cluster, '--no-locale', '--encoding=UTF8', '--auth=trust'], { stdio: 'ignore' });
    execFileSync(pg('pg_ctl'), ['-D', cluster, '-l', path.join(directory, 'postgres.log'), '-o', `-k ${directory} -p 55439 -h ''`, '-w', 'start'], { stdio: 'ignore' }); started = true;
    sql(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text); alter table storage.objects enable row level security;
      grant usage on schema storage to anon,authenticated; grant all on storage.objects to anon,authenticated;
      create policy broad_existing_policy on storage.objects for all to authenticated using (true) with check (true);`);
    sql(readFileSync(new URL('../supabase/migrations/20261024150000_printer_automation.sql', import.meta.url), 'utf8'));
    sql(readFileSync(new URL('../supabase/migrations/20261024190000_printer_material.sql', import.meta.url), 'utf8'));
    const user = '11111111-1111-1111-1111-111111111111';
    const template = '22222222-2222-2222-2222-222222222222';
    const tokenA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const tokenB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const runA = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    sql(`insert into auth.users values ('${user}');
      insert into public.printer_automation_templates(id,printer_id,name,file_name,storage_path,sha256,model,plate,created_by)
      values ('${template}','printer','Test','test.gcode.3mf','test',repeat('a',64),'P1S',1,'${user}');
      insert into storage.objects(bucket_id) values ('printer-automation'),('other');`);
    assert.equal(sql("set role authenticated; select count(*) from storage.objects where bucket_id='printer-automation'"), 'SET\n0');
    assert.equal(sql("set role authenticated; select count(*) from storage.objects where bucket_id='other'"), 'SET\n1');
    assert.throws(() => sql('set role authenticated; select * from public.printer_automation_templates'));
    assert.throws(() => sql(`set role authenticated; select public.claim_printer_automation('printer','${tokenA}')`));
    const configure = (mode, acknowledge = false) => sql(`select public.configure_printer_automation('printer','${template}','${mode}',2,'${user}',${acknowledge})`);
    configure('armed');
    assert.equal(sql("select material_requirement->>'type' from public.printer_automations"), 'PETG');
    assert.throws(() => sql("update public.printer_automations set material_requirement='{}'"));
    const results = await Promise.all([tokenA, tokenB].map(token => promisify(execFile)(pg('psql'), [...args, '-c', `select public.claim_printer_automation('printer','${token}')->>'printer_id'`])));
    assert.equal(results.filter(r => r.stdout.trim() === 'printer').length, 1);
    const token = sql("select lease_token from public.printer_automations where printer_id='printer'");
    const revision = sql("select revision from public.printer_automations where printer_id='printer'");
    const reserve = () => sql(`select public.reserve_printer_automation_run('printer','${token}',${revision},'${runA}')`);
    assert.equal(reserve(), 't'); assert.equal(reserve(), 'f');
    assert.equal(sql('select count(*) from public.printer_automation_runs'), '1');
    assert.equal(sql('select remaining_runs from public.printer_automations'), '1');
    assert.throws(() => configure('armed'));
    configure('off'); configure('armed', true);
    assert.equal(reserve(), 'f', 'configuration revision invalidates old worker');
    sql(`select public.claim_printer_automation('printer','${tokenA}')`);
    const nextRevision = sql('select revision from public.printer_automations');
    sql("update public.printer_automations set lease_until=now()-interval '1 second'");
    assert.equal(sql(`select public.reserve_printer_automation_run('printer','${tokenA}',${nextRevision},'dddddddd-dddd-dddd-dddd-dddddddddddd')`), 'f');
  } finally {
    if (started) execFileSync(pg('pg_ctl'), ['-D', cluster, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' });
    rmSync(directory, { recursive: true, force: true });
  }
});
