import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as fflate from 'fflate';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

function compile(file, mocks = {}, globals = {}, extraSource = '') {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8') + extraSource, {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  runInNewContext(source, { exports, Buffer, Date, console, URL, AbortSignal, ...globals,
    require(name) { assert.ok(Object.hasOwn(mocks, name), `Unexpected import: ${name}`); return mocks[name]; },
  });
  return exports;
}
const materials = compile('src/lib/printer-automation/material.ts');
const types = compile('src/lib/printer-automation/types.ts');
const decisions = compile('src/lib/printer-automation/decision.ts', { './types': types });
const now = Date.parse('2026-10-24T12:00:00Z');
const iso = ms => new Date(ms).toISOString();
const printer = { id: 'p1', status: 'idle', statusSource: 'live', statusObservedAt: iso(now), statusStale: false, liveStateConfirmed: true };
const automation = { idle_since: iso(now - types.IDLE_MS), last_observed_at: iso(now - 30_000) };
const empty = { state: 'empty', confidence: 0.99, fullBedVisible: true, platePresent: true, personOrHandVisible: false, reason: 'Frei' };

test('MQTT waits for subscription acknowledgement and rejects retained or incomplete printer states', async () => {
  const client = new EventEmitter();
  const acknowledgements = [];
  const published = [];
  const timers = new Set();
  let ended = false;
  client.subscribe = (topic, options, acknowledge) => acknowledgements.push(acknowledge);
  client.publish = (topic, payload) => published.push({ topic, payload });
  client.end = () => { ended = true; };
  const cloud = compile('src/lib/bambu-cloud.ts', {
    'node:crypto': { randomUUID }, 'node:fs/promises': {}, 'node:path': {},
    mqtt: { default: { connect: () => client } },
    '@/lib/printer-automation/material': materials, 'next/cache': { unstable_cache: fn => fn }, '@/lib/supabase/admin': {},
  }, {
    process: { env: {} },
    setTimeout: fn => { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn),
  }, '\nexport { collectPushStatuses };');
  const result = cloud.collectPushStatuses('test-token', 'test-user', ['p1', 'p2']);
  client.emit('connect');
  assert.equal(published.length, 0);
  acknowledgements.forEach(acknowledge => acknowledge());
  assert.equal(published.length, 2);
  const report = (id, print, retain = false) => client.emit('message', `device/${id}/report`, Buffer.from(JSON.stringify({ print })), { retain });
  report('p1', { gcode_state: 'IDLE', subtask_name: 'retained' }, true);
  report('p2', { gcode_state: 'IDLE' }, true);
  assert.equal(ended, false);
  report('p1', { mc_percent: 0 });
  report('p2', { mc_percent: 0 });
  assert.equal(ended, false);
  report('p1', { command: 'project_file', gcode_state: 'IDLE' });
  report('p2', { command: 'push_status', gcode_state: 'IDLE' });
  assert.equal(ended, false);
  report('p1', { command: 'push_status', gcode_state: 'RUNNING' });
  report('p1', { nozzle_diameter: '0.4', ams: {} });
  report('p2', { nozzle_diameter: '0.4', ams: {} });
  const statuses = await result;
  assert.equal(ended, true);
  assert.equal(statuses.get('p1').gcode_state, 'RUNNING');
  assert.equal(statuses.get('p1').subtask_name, undefined);
  assert.equal(statuses.get('p2').gcode_state, 'IDLE');
  assert.equal(timers.size, 0);
});

test('15 minutes of continuously observed idle are required', () => {
  assert.equal(decisions.observeIdle(automation, printer, now).ready, true);
  assert.equal(decisions.observeIdle({ ...automation, idle_since: iso(now - types.IDLE_MS + 1) }, printer, now).ready, false);
  for (const patch of [{ last_observed_at: null }, { last_observed_at: iso(now - 180_001) }, { last_observed_at: iso(now + 1) }, { idle_since: iso(now + 1) }]) {
    const result = decisions.observeIdle({ ...automation, ...patch }, printer, now);
    assert.equal(result.ready, false); assert.equal(result.idleSince, iso(now));
  }
});
test('cached, cloud-only, stale, missing and non-idle status never starts the timer', () => {
  for (const patch of [{ liveStateConfirmed: false }, { statusSource: 'cloud' }, { statusStale: true }, { statusObservedAt: iso(now - 30_001) }, { statusObservedAt: 'bad' },
    { statusObservedAt: iso(now + 3_000) }, ...['printing', 'paused', 'offline', 'error', 'unknown'].map(status => ({ status }))]) {
    assert.equal(decisions.observeIdle(automation, { ...printer, ...patch }, now).idleSince, null);
  }
  assert.equal(decisions.isFreshIdle(undefined, now), false);
});
test('bed decisions fail closed for low confidence, invisible plate, hands and invalid values', () => {
  assert.equal(decisions.isClearBed(empty), true);
  for (const patch of [{ state: 'occupied' }, { state: 'uncertain' }, { confidence: .97 }, { confidence: NaN }, { confidence: 2 },
    { fullBedVisible: false }, { platePresent: false }, { personOrHandVisible: true }]) assert.equal(decisions.isClearBed({ ...empty, ...patch }), false);
});
test('two distinct recent captures separated by 20 seconds are needed', () => {
  const first = decisions.confirmClearBed({}, empty, { capturedAt: iso(now), hash: 'first' }, now);
  assert.equal(first.ready, false);
  const state = { clear_since: iso(now - 30_000), last_image_hash: 'first', last_verdict: empty };
  assert.equal(decisions.confirmClearBed(state, empty, { capturedAt: iso(now), hash: 'second' }, now).ready, true);
  for (const image of [{ capturedAt: iso(now), hash: 'first' }, { capturedAt: iso(now - 20_000), hash: 'second' },
    { capturedAt: iso(now - 60_001), hash: 'second' }, { capturedAt: iso(now + 3_000), hash: 'second' }]) {
    assert.equal(decisions.confirmClearBed(state, empty, image, now).ready, false);
  }
  assert.equal(decisions.confirmClearBed({ ...state, clear_since: iso(now - 180_001) }, empty, { capturedAt: iso(now), hash: 'second' }, now).ready, false);
});

const NextResponse = { json: (data, init) => ({ data, status: init?.status ?? 200, headers: new Headers() }) };
function authFor(user, roles, calls = []) {
  return compile('src/lib/printer-automation/auth.ts', {
    'node:crypto': { timingSafeEqual }, 'next/server': { NextResponse },
    '@/lib/roles': { userCanAccessModule: async () => roles.includes('admin') },
    '@/lib/supabase/route': { createSupabaseRouteClient: () => ({ supabase: { auth: { getUser: async () => ({ data: { user } }) } }, response: {} }),
      withSupabaseCookies: target => { calls.push('cookies'); return target; } },
  });
}
const request = (method = 'GET', origin = 'https://app.test') => ({ method, headers: new Headers({ origin }), nextUrl: new URL('https://app.test/api/admin/printer-automation') });
const presentation = compile('src/lib/printer-automation/presentation.ts');
test('dashboard only attributes a fresh matching active job to the loop, including after switching it off', () => {
  const loop = { mode: 'off', last_run_id: '12345678-1234-1234-1234-123456789abc' };
  const printing = { ...printer, status: 'printing', progress: 45, jobName: `konglo-${loop.last_run_id}` };
  assert.equal(presentation.currentPrint(printing, loop, now).fromLoop, true);
  for (const patch of [{ jobName: 'manually-started-file' }, { status: 'idle' }, { status: 'error' },
    { statusStale: true }, { liveStateConfirmed: false }, { statusSource: 'cloud' },
    { statusObservedAt: iso(now - 90_001) }, { statusObservedAt: 'bad' }]) {
    assert.equal(presentation.currentPrint({ ...printing, ...patch }, loop, now).fromLoop, false);
  }
  assert.equal(presentation.loopPhase(undefined, false), 'Nicht abrufbar');
  assert.equal(presentation.loopPhase(undefined, true), 'Nicht eingerichtet');
  assert.equal(presentation.loopPhase(loop, true), 'Ausgeschaltet');
});

function overviewRoute({ load, live, metadata, user = { id: 'u' }, roles = ['admin'] }) {
  return compile('src/app/api/admin/printer-automation/route.ts', {
    'next/server': { NextResponse },
    '@/lib/bambu-cloud': { fetchPrintersFromCloud: live, fetchPrinterMetadataCached: metadata },
    '@/lib/supabase/admin': {}, '@/lib/printer-automation/auth': authFor(user, roles),
    '@/lib/printer-automation/bridge': { getBridgeHealth: async () => ({ connected: false, printers: [], message: 'Not configured' }) },
    '@/lib/printer-automation/material': materials, '@/lib/printer-automation/decision': decisions,
    '@/lib/printer-automation/store': { loadAutomationData: load }, '@/lib/printer-automation/templates': {},
  }, { process: { env: {} } });
}
test('dashboard keeps live status available without automation tables and never exposes raw database errors', async () => {
  const route = overviewRoute({
    load: async () => { throw new Error('private database details'); },
    live: async () => [{ ...printer, name: 'P1S', model: 'P1S', serial: 'private-serial' }],
    metadata: async () => { throw new Error('should not need metadata'); },
  });
  const { data, status } = await route.GET(request());
  assert.equal(status, 200);
  assert.equal(data.storage.available, false);
  assert.equal(data.printerStatus.available, true);
  assert.equal(data.printers[0].status, 'idle');
  assert.equal(data.printers[0].serial, undefined);
  assert.equal(JSON.stringify(data).includes('private'), false);
});
test('dashboard keeps saved loops during a cloud outage and protects the live data with admin auth', async () => {
  const fixtures = {
    load: async () => ({ templates: [{ id: 't1', name: 'Bracket', storage_path: 'private-file' }], automations: [{ printer_id: 'p1', template_id: 't1', mode: 'armed' }], runs: [] }),
    live: async () => { throw new Error('private cloud details'); },
    metadata: async () => [{ id: 'p1', name: 'P1S', model: 'P1S', serial: 'serial' }],
  };
  const { data } = await overviewRoute(fixtures).GET(request());
  assert.equal(data.storage.available, true);
  assert.equal(data.printerStatus.available, false);
  assert.equal(data.templates[0].storage_path, undefined);
  assert.equal(data.automations[0].template_id, 't1');
  assert.equal(data.printers[0].status, 'unknown');
  assert.equal(data.printers[0].statusSource, 'unavailable');
  for (const [user, roles, expected] of [[null, [], 401], [{ id: 'u' }, ['member'], 403]]) {
    let reads = 0;
    const blocked = overviewRoute({ ...fixtures, user, roles, load: async () => { reads++; }, live: async () => { reads++; } });
    assert.equal((await blocked.GET(request())).status, expected);
    assert.equal(reads, 0);
  }
});
test('all automation actions require an authenticated admin before executing', async () => {
  for (const method of ['GET', 'PUT', 'POST']) for (const [user, roles, expected] of [[null, [], 401], [{ id: 'u' }, ['member'], 403], [{ id: 'u' }, ['backend'], 403], [{ id: 'u' }, ['vhc'], 403], [{ id: 'u' }, ['admin'], 200]]) {
    let reached = false;
    const response = await authFor(user, roles).adminAutomationRequest(request(method), async () => { reached = true; return NextResponse.json({ ok: true }); });
    assert.equal(response.status, expected); assert.equal(reached, expected === 200);
  }
});
test('cross-origin admin writes are rejected and worker secrets fail closed', async () => {
  const auth = authFor({ id: 'u' }, ['admin']);
  const result = await auth.adminAutomationRequest(request('PUT', 'https://attacker.test'), () => { throw new Error('must not execute'); });
  assert.equal(result.status, 403);
  for (const [header, secret] of [[null, undefined], ['Bearer x', 'x'], ['Bearer wrong', 's'.repeat(32)], ['Basic x', 's'.repeat(32)]]) assert.equal(auth.validWorkerSecret(header, secret), false);
  assert.equal(auth.validWorkerSecret(`Bearer ${'s'.repeat(32)}`, 's'.repeat(32)), true);
});

const auth = authFor({ id: 'u' }, ['admin']);
const templates = compile('src/lib/printer-automation/templates.ts', { 'node:crypto': { createHash }, fflate, './auth': auth, './decision': decisions, './types': types });
test('history is filtered per printer and a task from another printer cannot be selected', async () => {
  let payload = { hits: [{ id: 123, deviceId: 'p1', title: 'Own', plateIndex: 3, amsMapping: [1, -1] }, { id: 456, deviceId: 'p2', title: 'Other' }], total: 22 };
  let requested;
  const cloud = compile('src/lib/bambu-cloud.ts', {
    'node:crypto': { randomUUID }, 'node:fs/promises': {}, 'node:path': {}, mqtt: {},
    '@/lib/printer-automation/material': materials, 'next/cache': { unstable_cache: fn => fn }, '@/lib/supabase/admin': {},
  }, { process: { env: {} }, fetch: async url => { requested = url; return { ok: true, text: async () => JSON.stringify(payload) }; } },
  '\nstoredTokensLoaded = true; tokenCache = { token: "test", expiresAt: Infinity };');
  const page = await cloud.fetchPrinterHistory('p1');
  assert.equal(new URL(requested).searchParams.get('deviceId'), 'p1');
  assert.equal(page.jobs.length, 1); assert.equal(page.jobs[0].plate, 3);
  assert.equal(page.jobs[0].amsMapping[1], -1); assert.equal(page.nextOffset, 2);
  payload = { id: 456, deviceId: 'p2' };
  assert.equal(await cloud.fetchPrinterHistoryJob('p1', '456'), null);
  payload = { id: 999, deviceId: 'p1' };
  assert.equal(await cloud.fetchPrinterHistoryJob('p1', '456'), null);
  assert.equal(await cloud.fetchPrinterHistoryJob('p1', '../private'), null);
});

test('history drafts and photos persist privately per printer; changed selections and old photos cannot overwrite newer data', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'printer-ui-'));
  const makeStore = () => compile('src/lib/printer-automation/local-state.ts', {
    'node:crypto': { createHash, randomUUID }, 'node:fs/promises': { default: fs }, 'node:path': { default: path }, sharp: { default: sharp },
  }, { process: { env: { PRINTER_AUTOMATION_DATA_DIR: directory } } });
  try {
    const store = makeStore();
    const job = { printerId: 'p1', id: '123', title: 'Own', plate: 1 };
    await store.saveHistoryDraft(job);
    assert.equal(await store.readHistoryDraft('p2'), null);
    const bytes = Buffer.from('test-file');
    const file = { fileName: 'part.gcode.3mf', model: 'P1S', plate: 1, sha256: createHash('sha256').update(bytes).digest('hex'), useAms: true, amsMapping: [1, -1] };
    const draft = await store.attachHistoryDraftFile('p1', '123', bytes, file);
    assert.deepEqual(await store.readHistoryDraftFile(draft.file), bytes);
    const restored = await makeStore().readHistoryDraft('p1');
    assert.equal(restored.file.id, draft.file.id);
    await store.saveHistoryDraft(job);
    assert.equal((await store.readHistoryDraft('p1')).file.id, draft.file.id);
    await store.saveHistoryDraft({ ...job, id: '124' });
    await assert.rejects(store.attachHistoryDraftFile('p1', '123', bytes, file), /changed/);
    await assert.rejects(store.clearHistoryDraft('p1', '123'), /changed/);
    assert.equal((await store.readHistoryDraft('p1')).file, null);
    await store.clearHistoryDraft('p1', '124');
    assert.equal(await store.readHistoryDraft('p1'), null);
    const jpeg = await sharp({ create: { width: 320, height: 240, channels: 3, background: '#222222' } }).jpeg().toBuffer();
    await store.saveLastPrinterPhoto('p1', jpeg, iso(now), 'cloud-test');
    await store.saveLastPrinterPhoto('p1', jpeg, iso(now - 60_000), 'cloud-test');
    assert.equal((await makeStore().readLastPrinterPhoto('p1')).capturedAt, iso(now));
    assert.equal(await store.readLastPrinterPhoto('p2'), null);
    const photo = await store.readLastPrinterPhoto('p1');
    const check = { imageHash: photo.sha256, capturedAt: photo.capturedAt, checkedAt: iso(now), model: 'test', verdict: empty };
    assert.equal(await store.savePhotoBedCheck('p1', check), true);
    assert.equal((await makeStore().readPrinterPhotoView('p1')).check.verdict.state, 'empty');
    await store.saveLastPrinterPhoto('p1', jpeg, iso(now + 1_000), 'camera-service');
    assert.equal(await store.savePhotoBedCheck('p1', check), false);
    assert.equal((await store.readPrinterPhotoView('p1')).check, null);
    await assert.rejects(store.saveLastPrinterPhoto('p1', jpeg, 'invalid', 'cloud-test'), /Invalid/);
    for (const name of await fs.readdir(directory)) assert.equal((await fs.stat(path.join(directory, name))).mode & 0o077, 0);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('history, draft uploads and camera photos reject non-admin reads and writes before touching private data', async () => {
  const mocks = { 'next/server': { NextResponse }, '@/lib/bambu-cloud': {},
    '@/lib/printer-automation/local-state': {}, '@/lib/printer-automation/templates': {},
    '@/lib/printer-automation/photo-check': {}, '@/lib/printer-automation/bridge': {}, 'node:crypto': { createHash },
    '@/lib/printer-automation/types': types, '@/lib/printer-automation/save-template': {} };
  for (const [file, methods] of [['history', ['GET', 'POST', 'DELETE']], ['history/file', ['POST']], ['history/import', ['POST']], ['photo', ['GET']], ['photo/check', ['POST']], ['camera', ['POST']]]) {
    for (const [user, roles, code] of [[null, [], 401], [{ id: 'u' }, ['member'], 403]]) {
      const route = compile(`src/app/api/admin/printer-automation/${file}/route.ts`, {
        ...mocks, '@/lib/printer-automation/auth': authFor(user, roles),
      });
      for (const method of methods) assert.equal((await route[method](request(method))).status, code);
    }
  }
});

test('draft uploads reject a changed history selection, wrong printer model and unsliced project files', async () => {
  let selection = { job: { id: '123' } };
  let saved = 0;
  const route = compile('src/app/api/admin/printer-automation/history/file/route.ts', {
    'next/server': { NextResponse }, '@/lib/bambu-cloud': { fetchPrinterMetadataCached: async () => [{ id: 'p1', model: 'P1S' }] },
    '@/lib/printer-automation/auth': auth, '@/lib/printer-automation/types': types,
    '@/lib/printer-automation/local-state': { readHistoryDraft: async () => selection, attachHistoryDraftFile: async () => { saved++; } },
    '@/lib/printer-automation/templates': templates,
  });
  const uploadRequest = (fileName, bytes) => ({ ...request('POST'), nextUrl: new URL(`https://app.test/?printerId=p1&taskId=123&fileName=${fileName}&plate=1&useAms=false`), body: new Blob([bytes]).stream() });
  selection = { job: { id: 'changed' } };
  assert.equal((await route.POST(uploadRequest('part.gcode.3mf', zip()))).status, 409);
  selection = { job: { id: '123' } };
  assert.equal((await route.POST(uploadRequest('part.gcode.3mf', zip('Bambu Lab A1 mini')))).status, 400);
  assert.equal((await route.POST(uploadRequest('project.3mf', zip()))).status, 400);
  assert.equal(saved, 0);
  assert.equal((await route.POST(uploadRequest('part.gcode.3mf', zip()))).status, 201);
  assert.equal(saved, 1);
});
const zip = (model = 'Bambu Lab P1S', files = {}) => fflate.zipSync({
  'Metadata/project_settings.config': fflate.strToU8(JSON.stringify({ printer_model: model })),
  'Metadata/plate_1.gcode': fflate.strToU8('G28\n'), ...files,
});
test('templates must be sliced for the selected printer and plate', () => {
  const bytes = zip();
  const result = templates.inspectPrintFile(bytes, 'test.gcode.3mf', 'P1S', 1);
  assert.equal(result.model, 'Bambu Lab P1S');
  assert.equal(result.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.throws(() => templates.inspectPrintFile(bytes, 'project.3mf', 'P1S', 1));
  assert.throws(() => templates.inspectPrintFile(bytes, 'test.gcode.3mf', 'A1 Mini', 1));
  assert.throws(() => templates.inspectPrintFile(bytes, 'test.gcode.3mf', 'P1S', 2));
  assert.throws(() => templates.inspectPrintFile(Buffer.from('not a zip'), 'test.gcode.3mf', 'P1S', 1));
  assert.throws(() => templates.inspectPrintFile(zip(undefined, { '../escape': fflate.strToU8('x') }), 'test.gcode.3mf', 'P1S', 1));
  assert.throws(() => templates.inspectPrintFile(zip(undefined, { 'Metadata/project_settings.config': new Uint8Array(1024 * 1024 + 1) }), 'test.gcode.3mf', 'P1S', 1));
});
test('streamed request bodies cannot exceed the configured maximum', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(16)); }, cancel() { cancelled = true; } });
  await assert.rejects(templates.readLimitedBody(stream, 20), /groß/);
  assert.equal(cancelled, true);
});

test('page and worker enforce access even when middleware is bypassed', async () => {
  for (const [user, roles, expected] of [[null, [], 'redirect'], [{ id: 'u' }, ['member'], 'section'], [{ id: 'u' }, ['admin'], 'ui']]) {
    const page = compile('src/app/[lang]/printers/automation/page.tsx', {
      'react/jsx-runtime': { jsx: type => type, jsxs: type => type }, './AutomationClient': { default: 'ui' }, 'next/link': { default: 'link' },
      'next/navigation': { redirect: () => { throw new Error('redirect'); } },
      '@/lib/server-session': { getServerSession: async () => ({ user }), getServerSessionRoles: async () => roles },
    });
    if (expected === 'redirect') await assert.rejects(page.default(), /redirect/); else assert.equal(await page.default(), expected);
  }
  let ran = false;
  const worker = compile('src/app/api/internal/printer-automation/tick/route.ts', {
    'next/server': { NextResponse }, '@/lib/printer-automation/auth': auth,
    '@/lib/printer-automation/runner': { runAutomationTick: async () => { ran = true; return []; } },
  }, { process: { env: { PRINTER_AUTOMATION_WORKER_SECRET: 's'.repeat(32) } } });
  assert.equal((await worker.POST({ headers: new Headers() })).status, 401); assert.equal(ran, false);
  assert.equal((await worker.POST({ headers: new Headers({ authorization: `Bearer ${'s'.repeat(32)}` }) })).status, 200); assert.equal(ran, true);
});

test('runner never dispatches in test mode or after stale status, revoked rights, failed vision or a lost lease', async () => {
  for (const scenario of ['material-missing', 'material-changed', 'file-mismatch', 'observe', 'stale', 'revoked', 'vision-error', 'lease-lost', 'changed-config', 'good', 'ambiguous', 'waiting-start']) {
    const time = Date.now(); let dispatched = 0; const patches = []; let reserved = false;
    const a = { ...automation, printer_id: 'p1', template_id: 't1', mode: scenario === 'observe' ? 'observe' : 'armed',
      phase: scenario === 'waiting-start' ? 'awaiting_start' : 'watching', remaining_runs: 1, authorized_by: 'admin', revision: 1,
      idle_since: iso(time - types.IDLE_MS), last_observed_at: iso(time - 30_000), clear_since: iso(time - 30_000),
      last_image_hash: 'old', last_verdict: empty, dispatched_at: iso(time), last_run_id: 'previous' };
    let fetches = 0;
    const inventory = materials.parseMaterialInventory(externalReport(), 'P1S', iso(time), true);
    const live = { materialInventory: scenario === 'material-missing' ? undefined : inventory, ...printer, model: 'P1S', statusObservedAt: iso(time), ...(scenario === 'stale' ? { statusStale: true } : {}) };
    const db = {
      auth: { admin: { getUserById: async () => ({ data: { user: { id: 'admin' } } }) } },
      rpc: async name => name === 'claim_printer_automation' ? { data: a } : (reserved = scenario !== 'changed-config', { data: reserved }),
      storage: { from: () => ({ download: async () => ({ data: new Blob([materialZip(scenario === 'file-mismatch' ? { filament_type: ['PLA'] } : {})]) }) }) },
      from: table => {
        let patch = null;
        const query = { select: () => query, neq: () => query, eq: () => query, gt: () => query,
          update: value => { patch = value; patches.push(value); return query; }, single: () => query,
          then: resolve => resolve({ data: table === 'printer_automation_templates'
            ? { id: 't1', printer_id: 'p1', model: 'P1S', storage_path: 'test', file_name: 'part.gcode.3mf', plate: 1 }
            : patch ? scenario === 'lease-lost' ? [] : [{ printer_id: 'p1' }] : [{ printer_id: 'p1' }] }),
        }; return query;
      },
    };
    const runner = compile('src/lib/printer-automation/runner.ts', {
      'node:crypto': { randomUUID }, '@/lib/bambu-cloud': { fetchPrintersFromCloud: async () => [++fetches > 1 && scenario === 'material-changed' ? { ...live, materialInventory: undefined } : live] },
      '@/lib/roles': { getUserRoles: async () => scenario === 'revoked' ? ['member'] : ['admin'] },
      '@/lib/supabase/admin': { createSupabaseAdminClient: () => db }, './decision': decisions, './types': types,
      './material': materials, './templates': templates,
      './vision': { inspectPrinterBed: async () => { if (scenario === 'vision-error') throw new Error('down'); return empty; } },
      './bridge': { getBridgeHealth: async () => ({ connected: true, printers: [{ id: 'p1', camera: true, canStart: true }] }),
        capturePrinterImage: async () => ({ jpeg: Buffer.from('image'), hash: 'new', capturedAt: iso(time) }),
        dispatchPrint: async () => { assert.equal(reserved, true); dispatched++; if (scenario === 'ambiguous') throw new Error('timeout'); return 'accepted'; } },
    }, { process: { env: { PRINTER_AUTOMATION_LIVE_ENABLED: 'true' } } });
    const result = await runner.runAutomationTick();
    if (scenario === 'observe') assert.equal(result[0].result, 'would-start');
    if (scenario === 'material-missing') assert.equal(result[0].result, 'material-unavailable');
    if (['material-changed', 'file-mismatch'].includes(scenario)) assert.equal(result[0].result, 'material-recheck-failed');
    assert.equal(dispatched, ['good', 'ambiguous'].includes(scenario) ? 1 : 0, scenario);
    if (scenario === 'ambiguous') assert.ok(patches.some(p => p.mode === 'off' && p.phase === 'blocked'));
  }
});

test('optical status never presents old, mismatched or inconclusive photos as currently clear', () => {
  const { photoBedStatus } = compile('src/lib/printer-automation/photo-presentation.ts', { './decision': decisions, './types': types });
  const check = { imageHash: 'hash', capturedAt: iso(now), checkedAt: iso(now), verdict: empty };
  const photo = { sha256: 'hash', capturedAt: iso(now), check };
  assert.equal(photoBedStatus(photo, now).current, 'empty');
  assert.equal(photoBedStatus(photo, now + 60_001).current, null);
  assert.equal(photoBedStatus(photo, now + 60_001).result, 'empty');
  assert.equal(photoBedStatus(photo, now - 3_000).current, null);
  assert.equal(photoBedStatus({ ...photo, sha256: 'new' }, now).result, null);
  assert.equal(photoBedStatus({ ...photo, capturedAt: iso(now + 1_000) }, now).result, null);
  assert.equal(photoBedStatus(null, now).current, null);
  for (const patch of [{ confidence: 0.97 }, { fullBedVisible: false }, { platePresent: false }, { personOrHandVisible: true }, { state: 'uncertain' }]) {
    assert.equal(photoBedStatus({ ...photo, check: { ...check, verdict: { ...empty, ...patch } } }, now).current, 'uncertain');
  }
  assert.equal(photoBedStatus({ ...photo, check: { ...check, verdict: { ...empty, state: 'occupied' } } }, now).current, 'occupied');
});

test('photo checks deduplicate concurrent requests, persist results and reject replaced photos', async () => {
  let photo = { sha256: 'hash', capturedAt: iso(now), jpeg: Buffer.from('jpeg').toString('base64') };
  let saved = null; let calls = 0; let writes = 0; let replaced = false; let fail = false;
  const { checkSavedPrinterPhoto } = compile('src/lib/printer-automation/photo-check.ts', {
    './auth': auth,
    './local-state': {
      readLastPrinterPhoto: async () => photo, readPhotoBedCheck: async () => saved,
      savePhotoBedCheck: async (id, check) => { writes++; if (replaced) return false; saved = check; return true; },
    },
    './vision': { printerBedVisionModel: () => 'test', inspectPrinterBed: async bytes => {
      calls++; assert.equal(bytes.toString(), 'jpeg'); if (fail) throw new Error('secret upstream details'); return empty;
    } },
  }, { process: { env: { OPENAI_API_KEY: 'test' } } });
  await Promise.all([checkSavedPrinterPhoto('p1', 'hash'), checkSavedPrinterPhoto('p1', 'hash')]);
  assert.equal(calls, 1); assert.equal(writes, 1);
  await checkSavedPrinterPhoto('p1', 'hash');
  assert.equal(calls, 1);
  await assert.rejects(checkSavedPrinterPhoto('p1', 'wrong'), e => e.status === 409);
  saved = null; replaced = true;
  await assert.rejects(checkSavedPrinterPhoto('p1', 'hash'), e => e.status === 409);
  fail = true;
  await assert.rejects(checkSavedPrinterPhoto('p1', 'hash'), e => e.status === 503 && !e.message.includes('secret'));
  photo = null;
  await assert.rejects(checkSavedPrinterPhoto('p1', 'hash'), e => e.status === 404);
});

test('OpenAI vision sends the camera image and rejects incomplete or malformed decisions', async () => {
  let result = { status: 'completed', output_text: JSON.stringify(empty) }; let input;
  const vision = compile('src/lib/printer-automation/vision.ts', {
    '@/lib/openai': { createOpenAIClient: () => ({ responses: { create: async value => { input = value; return result; } } }) },
  }, { process: { env: {} } });
  assert.equal((await vision.inspectPrinterBed(Buffer.from('jpeg'))).state, 'empty');
  assert.equal(input.store, false);
  assert.equal(input.input[1].content[0].image_url, 'data:image/jpeg;base64,anBlZw==');
  for (const bad of [{ status: 'incomplete', output_text: JSON.stringify(empty) }, { status: 'completed', output_text: '{' },
    ...[{ confidence: 2 }, { fullBedVisible: 'true' }, { state: 'clear' }].map(patch => ({ status: 'completed', output_text: JSON.stringify({ ...empty, ...patch }) }))]) {
    result = bad; await assert.rejects(vision.inspectPrinterBed(Buffer.from('jpeg')));
  }
});

function externalReport() {
  return { nozzle_diameter: '0.4', hw_switch_state: 1, ams: { tray_now: '254' },
    vt_tray: { id: 254, tray_type: 'PETG', tray_color: '000000FF', tray_info_idx: 'GFG00' } };
}
function materialZip(patch = {}) {
  return zip(undefined, { 'Metadata/project_settings.config': fflate.strToU8(JSON.stringify({
    printer_model: 'P1S', filament_type: ['PETG'], filament_ids: ['GFG00'], nozzle_diameter: ['0.4'], ...patch,
  })) });
}
test('material selection checks physical presence, loaded external spool, color, nozzle and fresh reports', () => {
  const required = materials.DEFAULT_MATERIAL;
  const check = (raw, time = now, confirmed = true) => materials.selectMaterial(materials.parseMaterialInventory(raw, 'P1S', iso(time), confirmed), required, now);
  const raw = externalReport();
  assert.equal(check(raw).slot.id, 254);
  for (const patch of [{ nozzle_diameter: '0.6' }, { nozzle_diameter: undefined }, { hw_switch_state: 0 }, { ams: { tray_now: '255' } },
    { vt_tray: { ...raw.vt_tray, tray_color: '515151FF' } }, { vt_tray: { ...raw.vt_tray, tray_type: 'PLA' } }])
    assert.equal(check({ ...raw, ...patch }).ready, false);
  assert.equal(check(raw, now - 30001).ready, false); assert.equal(check(raw, now, false).ready, false);
  const ams = { ...raw, ams: { ams_exist_bits: '1', tray_exist_bits: '2', tray_now: '255', ams: [{ id: '0', tray: [{ ...raw.vt_tray, id: '1' }] }] } };
  assert.equal(check(ams).slot.id, 1);
  assert.equal(check({ ...ams, ams: { ...ams.ams, tray_exist_bits: '0' } }).ready, false);
  assert.equal(materials.colorMatches('161616', '000000'), true);
  const merged = materials.mergePrinterReport(ams, { ams: { tray_now: '1' } });
  assert.equal(check(merged).slot.id, 1);
  assert.equal(check(materials.mergePrinterReport(merged, { ams: { ams: [{ id: '0', tray: [{ id: '1' }] }] } })).ready, false);
});
test('dual-extruder material uses the bound nozzle and never guesses external routing', () => {
  const raw = { ...externalReport(), device: { extruder: { info: [{ id: 0, hnow: 1, info: 8 }] }, nozzle: { info: [{ id: 1, diameter: 0.6 }] } },
    ams: { ams_exist_bits: '1', tray_exist_bits: '1', ams: [{ id: '0', info: '10001003', tray: [{ ...externalReport().vt_tray, id: '0' }] }] } };
  const inv = materials.parseMaterialInventory(raw, 'H2D', iso(now), true);
  assert.equal(inv.slots.length, 1); assert.equal(inv.slots[0].nozzle, 0.6);
  assert.equal(materials.selectMaterial(inv, materials.DEFAULT_MATERIAL, now).ready, false);
});
test('sliced file must match single-material type, preset and nozzle; H2 tool mapping remains blocked', () => {
  const slot = materials.parseMaterialInventory(externalReport(), 'P1S', iso(now), true).slots[0];
  const check = patch => templates.validatePrintMaterial(materialZip(patch), 'part.gcode.3mf', 'P1S', 1, materials.DEFAULT_MATERIAL, slot);
  assert.equal(check({}), null);
  for (const patch of [{ filament_type: ['PLA'] }, { filament_type: ['PETG', 'PETG'] }, { filament_ids: ['GFG02'] }, { nozzle_diameter: ['0.6'] }, { nozzle_diameter: null }]) assert.equal(typeof check(patch), 'string');
});

test('ordinary printer endpoint does not expose admin material inventory', async () => {
  const route = compile('src/app/api/bambu/printers/route.ts', {
    'next/server': { NextResponse }, '@/lib/bambu-cloud': { fetchPrintersFromCloud: async () => [{ id: 'p1', materialInventory: { slots: ['private'] } }] },
  });
  const result = (await route.GET()).data;
  assert.equal(result.printers[0].id, 'p1');
  assert.equal(result.printers[0].materialInventory, undefined);
});
