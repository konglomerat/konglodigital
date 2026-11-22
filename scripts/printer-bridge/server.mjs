import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs/promises';
import { createHash, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { captureJpeg } from './camera.mjs';
import { captureCloudCamera } from './cloud-camera.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const normalizeModel = value => value.toUpperCase().replace(/BAMBU\s*LAB/g, '').replace(/[^A-Z0-9]/g, '');
const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

async function readBody(req, limit = 70 * 1024 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function runAdapter(command, request, timeoutMs = 20_000) {
  if (!Array.isArray(command) || !command.length || !path.isAbsolute(command[0]) || command.some(x => typeof x !== 'string')) throw new Error('Invalid adapter command');
  return new Promise((resolve, reject) => {
    const proc = spawn(command[0], command.slice(1), { shell: false, stdio: ['pipe', 'pipe', 'ignore'], timeout: timeoutMs, killSignal: 'SIGKILL' });
    const chunks = []; let size = 0;
    proc.stdout.on('data', chunk => { size += chunk.length; if (size > 16_384) proc.kill('SIGKILL'); else chunks.push(chunk); });
    proc.stdin.on('error', () => {});
    proc.on('error', () => reject(new Error('Print adapter failed')));
    proc.on('close', code => {
      if (code !== 0 || size > 16_384) return reject(new Error('Print adapter failed'));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('Invalid print adapter receipt')); }
    });
    proc.stdin.end(JSON.stringify(request));
  });
}

async function durableWrite(file, value) {
  const handle = await fs.open(file, 'w', 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
  finally { await handle.close(); }
}

export function createBridgeServer(config, { capture = camera => camera.type === 'bambu-cloud' ? captureCloudCamera(camera) : captureJpeg(camera), adapter = runAdapter } = {}) {
  if (typeof config.token !== 'string' || config.token.length < 32) throw new Error('Bridge token must contain at least 32 characters');
  if (!path.isAbsolute(config.stateDirectory ?? '')) throw new Error('Use an absolute persistent stateDirectory');
  const printers = new Map(config.printers.map(p => [p.id, p]));
  const busy = new Set();
  const canStart = p => config.liveEnabled === true && Array.isArray(p.startCommand) && p.startCommand.length > 0;
  const hasCamera = p => ['bambu-jpeg', 'bambu-cloud'].includes(p.camera?.type);
  return http.createServer(async (req, res) => {
    const supplied = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${config.token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return json(res, 401, { error: 'Unauthorized' });
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/v1/health') {
        return json(res, 200, { version: 1, printers: [...printers.values()].map(p => ({ id: p.id, camera: hasCamera(p), canStart: canStart(p) })) });
      }
      const match = /^\/v1\/printers\/([^/]+)\/(snapshot|start)$/.exec(url.pathname);
      const id = match && decodeURIComponent(match[1]);
      const printer = printers.get(id);
      if (!printer) return json(res, 404, { error: 'Printer not configured' });
      if (['GET', 'POST'].includes(req.method) && match[2] === 'snapshot') {
        const nonce = url.searchParams.get('nonce');
        if (!UUID.test(nonce ?? '') || !hasCamera(printer)) return json(res, 400, { error: 'Unsupported camera or invalid nonce' });
        if (busy.has(id)) return json(res, 409, { error: 'Printer busy' });
        busy.add(id);
        try {
          let credentials;
          if (req.method === 'POST') {
            if (config.allowRequestCredentials !== true || printer.camera.type !== 'bambu-cloud') return json(res, 400, { error: 'Request credentials disabled' });
            ({ credentials } = await readBody(req, 16_384));
            if (typeof credentials?.token !== 'string' || credentials.token.length > 12_000 || /[\r\n]/.test(credentials.token)
              || !Number.isFinite(credentials.expiresAt) || credentials.expiresAt <= Date.now())
              return json(res, 400, { error: 'Invalid cloud session' });
          }
          const image = await capture({ ...printer.camera, ...(credentials ? { credentials } : {}) });
          res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store',
            'X-Captured-At': image.capturedAt, 'X-Capture-Nonce': nonce, 'X-Printer-Id': id });
          res.end(image.jpeg);
        } finally { busy.delete(id); }
        return;
      }
      if (req.method !== 'POST' || match[2] !== 'start') return json(res, 405, { error: 'Method not allowed' });
      if (!canStart(printer)) return json(res, 503, { error: 'Signed print adapter not configured' });
      const body = await readBody(req);
      const { runId, sha256, plate, useAms, amsMapping, model, imageCapturedAt, material } = body;
      if (!UUID.test(runId ?? '') || req.headers['idempotency-key'] !== runId || !/^[a-f0-9]{64}$/.test(sha256 ?? '')
        || !Number.isInteger(plate) || plate < 1 || plate > 100 || typeof useAms !== 'boolean'
        || !Array.isArray(amsMapping) || amsMapping.length > 16 || amsMapping.some(n => !Number.isInteger(n) || n < -1 || n > 255)
        || (useAms && amsMapping.length === 0) || typeof model !== 'string' || normalizeModel(model) !== normalizeModel(printer.model)
        || typeof body.file !== 'string') return json(res, 400, { error: 'Invalid print request' });
      const slot = material?.slot, requirement = material?.requirement;
      const materialTime = Date.parse(material?.observedAt);
      if (!slot || !requirement || !Number.isFinite(materialTime) || materialTime > Date.now() + 2000 || Date.now() - materialTime > 30_000
        || !['PETG', 'PLA', 'ABS', 'ASA', 'TPU', 'TPU-AMS', 'PA', 'PC'].includes(requirement.type)
        || !/^[0-9A-F]{6}$/.test(requirement.color ?? '') || ![0.2, 0.4, 0.6, 0.8].includes(requirement.nozzle)
        || !['auto', 'ams', 'external'].includes(requirement.source)
        || slot.type !== requirement.type || slot.nozzle !== requirement.nozzle || slot.present !== true || slot.extruder !== 0
        || typeof slot.profile !== 'string' || !slot.profile || slot.profile.length > 100
        || (requirement.source !== 'auto' && requirement.source !== slot.source)
        || (useAms ? slot.source !== 'ams' || !Number.isInteger(slot.id) || slot.id < 0 || slot.id > 15 || amsMapping.length !== 1 || amsMapping[0] !== slot.id
          : slot.source !== 'external' || slot.id !== 254 || slot.loaded !== true || amsMapping.length !== 0))
        return json(res, 409, { error: 'Material selection missing, incompatible or expired' });
      const rgb = /^[0-9A-F]{6}$/.test(slot.color ?? '') ? slot.color.match(/../g).map(c => parseInt(c, 16)) : null;
      if (!rgb || (requirement.color === '000000' ? Math.max(...rgb) > 32 || Math.max(...rgb) - Math.min(...rgb) > 8 : slot.color !== requirement.color))
        return json(res, 409, { error: 'Material color mismatch' });
      const captured = Date.parse(imageCapturedAt);
      if (!Number.isFinite(captured) || captured > Date.now() + 2_000 || Date.now() - captured > 60_000) return json(res, 409, { error: 'Camera evidence expired' });
      const bytes = Buffer.from(body.file, 'base64');
      if (bytes.length > 50 * 1024 * 1024 || bytes.length < 4 || bytes.readUInt32LE(0) !== 0x04034b50
        || createHash('sha256').update(bytes).digest('hex') !== sha256) return json(res, 400, { error: 'Print file integrity mismatch' });
      const inputDigest = createHash('sha256').update(JSON.stringify({ id, sha256, plate, useAms, amsMapping, model, requirement, slot })).digest('hex');
      await fs.mkdir(config.stateDirectory, { recursive: true, mode: 0o700 });
      const journal = path.join(config.stateDirectory, `${runId}.json`);
      let marker;
      try { marker = await fs.open(journal, 'wx', 0o600); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        try {
          const receipt = JSON.parse(await fs.readFile(journal, 'utf8'));
          if (receipt.inputDigest !== inputDigest) return json(res, 409, { error: 'Idempotency key reused for another request' });
          return json(res, 200, { runId, state: receipt.state });
        } catch { return json(res, 200, { runId, state: 'unknown' }); }
      }
      // Persist BEFORE invoking a command. Even a process crash leaves a refusal
      // to repeat this run. Keep journals across restarts/deployments.
      try { await marker.writeFile(JSON.stringify({ runId, inputDigest, state: 'unknown' })); await marker.sync(); }
      finally { await marker.close(); }
      if (busy.has(id)) {
        await durableWrite(journal, { runId, inputDigest, state: 'rejected' });
        return json(res, 200, { runId, state: 'rejected' });
      }
      busy.add(id);
      const filePath = path.join(config.stateDirectory, `konglo-${runId}.gcode.3mf`);
      let state = 'unknown';
      try {
        await fs.writeFile(filePath, bytes, { flag: 'wx', mode: 0o600 });
        const receipt = await adapter(printer.startCommand, {
          operation: 'start', printerId: id, runId, filePath, sha256, plate, useAms, amsMapping, model,
          expectedJobName: `konglo-${runId}`, imageCapturedAt, requireFreshIdle: true,
          material, requireFreshMaterial: true,
          deadlineAt: new Date(Math.min(Date.now() + 20_000, captured + 60_000)).toISOString(),
        });
        if (receipt.runId === runId && ['accepted', 'rejected', 'unknown'].includes(receipt.state)) state = receipt.state;
      } catch { state = 'unknown'; }
      finally {
        // An unknown result retains the file for operator reconciliation.
        if (state !== 'unknown') await fs.rm(filePath, { force: true });
        busy.delete(id);
      }
      await durableWrite(journal, { runId, inputDigest, state });
      return json(res, 200, { runId, state });
    } catch (error) {
      // The cloud helper only emits allowlisted numeric diagnostics. Never log
      // SDK stdout/stderr, camera URLs, tokens, or incoming request bodies.
      console.error('Printer bridge request failed', /^Camera (helper|request)/.test(error?.message ?? '') ? error.message : 'Connection unavailable');
      if (!res.headersSent) json(res, 503, error?.code === 'LIGHT_UNCONFIRMED'
        ? { error: 'Printer light could not be confirmed', code: 'LIGHT_UNCONFIRMED' }
        : { error: 'Printer connection failed; inspect local configuration' });
      else res.end();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const file = process.env.PRINTER_BRIDGE_CONFIG;
  if (!file) throw new Error('Set PRINTER_BRIDGE_CONFIG to a private configuration file');
  const config = JSON.parse(await fs.readFile(file, 'utf8'));
  config.token = process.env.PRINTER_BRIDGE_TOKEN || config.token;
  const server = createBridgeServer(config);
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.listen(config.port ?? 8787, config.bind ?? '127.0.0.1', () => console.log('Printer bridge listening; credentials are not logged.'));
}
