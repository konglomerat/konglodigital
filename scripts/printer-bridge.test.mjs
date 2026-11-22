import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { once } from 'node:events';
import { cameraAuthPacket, createJpegFrameReader, captureJpeg } from './printer-bridge/camera.mjs';
import { createBridgeServer } from './printer-bridge/server.mjs';

const jpeg = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
function frame(bytes = jpeg) { const header = Buffer.alloc(16); header.writeUInt32LE(bytes.length); header.writeUInt32LE(1, 8); return Buffer.concat([header, bytes]); }
test('camera authentication and fragmented JPEG framing match A1/P1 protocol', () => {
  const packet = cameraAuthPacket('12345678');
  assert.equal(packet.length, 80); assert.equal(packet.readUInt32LE(0), 0x40); assert.equal(packet.readUInt32LE(4), 0x3000);
  assert.equal(packet.subarray(16, 20).toString(), 'bblp'); assert.equal(packet.subarray(48, 56).toString(), '12345678');
  const images = []; const read = createJpegFrameReader(image => images.push(image));
  const data = Buffer.concat([frame(), frame()]);
  for (let i = 0; i < data.length; i += 3) read(data.subarray(i, i + 3));
  assert.deepEqual(images, [jpeg, jpeg]);
  assert.throws(() => createJpegFrameReader(() => {})(Buffer.alloc(16)), /header/);
  assert.throws(() => createJpegFrameReader(() => {})(frame(Buffer.from('not jpeg'))), /JPEG/);
});
test('camera pin mismatch prevents sending credentials; capture skips initial frame', async () => {
  const cert = Buffer.from('test device certificate'); const fingerprint = createHash('sha256').update(cert).digest('hex');
  for (const correct of [false, true]) {
    const socket = new EventEmitter(); let writes = 0;
    socket.destroy = () => {}; socket.getPeerCertificate = () => ({ raw: cert });
    socket.write = () => { writes++; setImmediate(() => socket.emit('data', Buffer.concat([frame(), frame()]))); };
    const promise = captureJpeg({ host: 'test', accessCode: '12345678', certificateSha256: correct ? fingerprint : '0'.repeat(64) }, {
      connect: () => { setImmediate(() => socket.emit('secureConnect')); return socket; }, timeoutMs: 1000,
    });
    if (correct) { const result = await promise; assert.deepEqual(result.jpeg, jpeg); assert.equal(writes, 1); }
    else { await assert.rejects(promise, /certificate mismatch/); assert.equal(writes, 0); }
  }
});

test('bridge protects snapshots and never repeats a dispatch, including across restarts', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'konglo-bridge-test-'));
  const token = 't'.repeat(32); let starts = 0; let captures = 0; let fail = false;
  const config = { token, stateDirectory: directory, liveEnabled: true, printers: [{ id: 'p1', model: 'P1S', camera: { type: 'bambu-jpeg' }, startCommand: ['/fake/adapter'] }] };
  let server;
  async function start() {
    server = createBridgeServer(config, { capture: async () => { captures++; return { jpeg, capturedAt: new Date().toISOString() }; },
      adapter: async (_, request) => { starts++; assert.equal(request.requireFreshIdle, true); assert.equal(request.requireFreshMaterial, true); assert.equal(request.material.slot.id, 1); if (fail) throw new Error('unknown'); return { runId: request.runId, state: 'accepted' }; } });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    return `http://127.0.0.1:${server.address().port}`;
  }
  const stop = async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); };
  try {
    let base = await start();
    assert.equal((await fetch(`${base}/v1/health`)).status, 401);
    const health = await (await fetch(`${base}/v1/health`, { headers: { authorization: `Bearer ${token}` } })).json();
    assert.equal(health.printers[0].canStart, true); assert.equal(JSON.stringify(health).includes(token), false);
    const nonce = randomUUID();
    const snap = await fetch(`${base}/v1/printers/p1/snapshot?nonce=${nonce}`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(snap.headers.get('x-capture-nonce'), nonce); assert.equal(snap.headers.get('x-printer-id'), 'p1'); assert.equal(captures, 1);
    assert.deepEqual(Buffer.from(await snap.arrayBuffer()), jpeg);
    const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2]);
    const body = { runId: randomUUID(), file: bytes.toString('base64'), sha256: createHash('sha256').update(bytes).digest('hex'),
      model: 'Bambu Lab P1S', plate: 1, useAms: true, amsMapping: [1], material: { observedAt: new Date().toISOString(),
        requirement: { type: 'PETG', color: '000000', nozzle: 0.4, source: 'auto' },
        slot: { id: 1, source: 'ams', type: 'PETG', color: '000000', nozzle: 0.4, profile: 'GFG00', present: true, loaded: false, extruder: 0 } }, imageCapturedAt: new Date().toISOString() };
    const post = async value => fetch(`${base}/v1/printers/p1/start`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'idempotency-key': value.runId, 'content-type': 'application/json' }, body: JSON.stringify(value) });
    assert.equal((await (await post(body)).json()).state, 'accepted'); assert.equal(starts, 1);
    assert.equal((await (await post(body)).json()).state, 'accepted'); assert.equal(starts, 1);
    await stop(); base = await start();
    assert.equal((await (await post(body)).json()).state, 'accepted'); assert.equal(starts, 1);
    assert.equal((await post({ ...body, plate: 2 })).status, 409); assert.equal(starts, 1);
    assert.equal((await post({ ...body, runId: randomUUID(), sha256: '0'.repeat(64) })).status, 400);
    assert.equal((await post({ ...body, runId: randomUUID(), amsMapping: [-2] })).status, 400);
    assert.equal((await post({ ...body, runId: randomUUID(), material: undefined })).status, 409);
    assert.equal((await post({ ...body, runId: randomUUID(), material: { ...body.material, slot: { ...body.material.slot, color: '515151' } } })).status, 409);
    assert.equal((await post({ ...body, runId: randomUUID(), imageCapturedAt: new Date(Date.now() - 61_000).toISOString() })).status, 409);
    fail = true; const uncertain = { ...body, runId: randomUUID() };
    assert.equal((await (await post(uncertain)).json()).state, 'unknown'); assert.equal(starts, 2);
    assert.equal((await (await post(uncertain)).json()).state, 'unknown'); assert.equal(starts, 2);
  } finally { if (server?.listening) await stop(); await fs.rm(directory, { recursive: true, force: true }); }
});

test('bridge defaults to camera-only and refuses starts without an adapter', async () => {
  const server = createBridgeServer({ token: 't'.repeat(32), stateDirectory: '/unused', printers: [{ id: 'p1', model: 'P1S', camera: { type: 'bambu-jpeg' } }] });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/printers/p1/start`, { method: 'POST', headers: { authorization: `Bearer ${'t'.repeat(32)}` } });
    assert.equal(response.status, 503);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('cloud camera capability uses the same authenticated nonce contract and never enables starts', async () => {
  let received;
  const server = createBridgeServer({ token: 't'.repeat(32), stateDirectory: '/unused', printers: [{ id: 'p1', model: 'P1S', camera: { type: 'bambu-cloud', printerId: 'p1' } }] }, {
    capture: async camera => { received = camera; return { jpeg, capturedAt: new Date().toISOString() }; },
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { authorization: `Bearer ${'t'.repeat(32)}` };
  try {
    const health = await (await fetch(`${base}/v1/health`, { headers })).json();
    assert.equal(health.printers[0].camera, true); assert.equal(health.printers[0].canStart, false);
    const nonce = randomUUID();
    const image = await fetch(`${base}/v1/printers/p1/snapshot?nonce=${nonce}`, { headers });
    assert.equal(image.status, 200); assert.equal(image.headers.get('x-capture-nonce'), nonce); assert.equal(received.printerId, 'p1');
    assert.equal((await fetch(`${base}/v1/printers/p1/snapshot?nonce=${nonce}`)).status, 401);
    assert.equal((await fetch(`${base}/v1/printers/p1/start`, { method: 'POST', headers })).status, 503);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('camera processes keep only numeric diagnostics and terminate on timeout or oversized output', async () => {
  const { runCameraProcess } = await import('./printer-bridge/cloud-camera.mjs');
  const run = (source, options = {}) => runCameraProcess(process.execPath, ['-e', source], '', options);
  const values = await run("require('fs').writeSync(3, 'frames=2\\nprivate_url=secret\\ncodec=1\\n')");
  assert.deepEqual(values, { frames: 2, codec: 1 });
  await assert.rejects(run("require('fs').writeSync(3, 'private_url=secret\\nstream_start=-19\\n'); process.exit(1)"), error => /stream_start/.test(error.message) && !/secret/.test(error.message));
  await assert.rejects(run('setInterval(()=>{},1000)', { signal: AbortSignal.timeout(100) }), /timed out/);
  await assert.rejects(run("require('fs').writeSync(3, 'x'.repeat(20_000)); setInterval(()=>{},1000)"), /helper failed/);
});

test('unconfirmed illumination returns a specific error and releases the capture lock', async () => {
  let confirmed = false;
  const token = 't'.repeat(32);
  const server = createBridgeServer({ token, stateDirectory: '/unused', printers: [{ id: 'p1', model: 'P1S', camera: { type: 'bambu-cloud' } }] }, {
    capture: async () => {
      if (!confirmed) throw Object.assign(new Error('No light confirmation'), { code: 'LIGHT_UNCONFIRMED' });
      return { jpeg, capturedAt: new Date().toISOString() };
    },
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const snapshot = () => fetch(`http://127.0.0.1:${server.address().port}/v1/printers/p1/snapshot?nonce=${randomUUID()}`, { headers: { authorization: `Bearer ${token}` } });
  try {
    const failed = await snapshot();
    assert.equal(failed.status, 503); assert.equal((await failed.json()).code, 'LIGHT_UNCONFIRMED');
    confirmed = true;
    const retry = await snapshot();
    assert.equal(retry.status, 200); assert.deepEqual(Buffer.from(await retry.arrayBuffer()), jpeg);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('cloud request credentials are scoped to one capture, gated and never returned in health', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'camera-credentials-'));
  const secret = 's'.repeat(32);
  let captured;
  const config = { token: secret, stateDirectory: directory, allowRequestCredentials: true,
    printers: [{ id: 'p1', model: 'P1S', camera: { type: 'bambu-cloud' } }] };
  const server = createBridgeServer(config, { capture: async camera => { captured = camera; return { jpeg: Buffer.from('jpeg'), capturedAt: new Date().toISOString() }; } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const credentials = { token: 'session-only', expiresAt: Date.now() + 300000 };
    const response = await fetch(`${base}/v1/printers/p1/snapshot?nonce=${randomUUID()}`, { method: 'POST', headers: { Authorization: `Bearer ${secret}` }, body: JSON.stringify({ credentials }) });
    assert.equal(response.status, 200); assert.equal(captured.credentials.token, credentials.token);
    assert.equal(config.printers[0].camera.credentials, undefined);
    assert.equal((await (await fetch(`${base}/v1/health`, { headers: { Authorization: `Bearer ${secret}` } })).text()).includes(credentials.token), false);
  } finally { await new Promise(resolve => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); }
});
