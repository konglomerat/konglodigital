// One-time local setup for the tested Apple-Silicon + Docker camera transport.
// Uses already downloaded original Bambu libraries; never downloads SDKs or
// enables physical print starts. Secrets stay in private, ignored local files.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
process.umask(0o077);
const root = process.cwd();
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('This setup is for Apple Silicon');
const assets = path.resolve('.data/bambu-cloud-probe');
const runtime = path.resolve('.data/printer-bridge-runtime');
const common = {
  type: 'bambu-cloud',
  tokenStorePath: path.resolve(process.env.BAMBULAB_TOKEN_STORE_PATH || '.data/bambulab-tokens.json'),
  workDirectory: path.join(runtime, 'captures'),
  networkSdkDirectory: path.join(assets, 'linux-sdk-02.08.02.54'),
  sourceLibrary: path.join(assets, 'sdk-02.08.01.53/libBambuSource.dylib'),
  certificateDirectory: path.join(assets, 'public-cert'),
  authorizeBinary: path.join(runtime, 'authorize-linux'), receiverBinary: path.join(runtime, 'receive'),
  dockerPath: '/usr/local/bin/docker', dockerImage: 'konglo-bambu-camera-probe:qemu',
};
for (const file of [common.tokenStorePath, common.sourceLibrary, common.authorizeBinary, common.receiverBinary, common.dockerPath, path.join(common.networkSdkDirectory, 'libbambu_networking.so')]) await fs.access(file);
const stored = JSON.parse(await fs.readFile(common.tokenStorePath, 'utf8'));
if (!stored.token || stored.expiresAt <= Date.now()) throw new Error('Refresh Bambu login in the app before setup');
const response = await fetch('https://api.bambulab.com/v1/iot-service/api/user/bind', { headers: { Authorization: `Bearer ${stored.token}` }, signal: AbortSignal.timeout(15_000), redirect: 'error' });
if (!response.ok) throw new Error('Could not list bound printers');
const { devices } = await response.json();
if (!devices?.length) throw new Error('No bound printers');
const token = process.env.PRINTER_BRIDGE_TOKEN || randomBytes(32).toString('hex');
const workerSecret = process.env.PRINTER_AUTOMATION_WORKER_SECRET || randomBytes(32).toString('hex');
if (token.length < 32 || workerSecret.length < 32) throw new Error('Existing service secrets are too short');
const config = {
  bind: '127.0.0.1', port: 8787, token, liveEnabled: false, stateDirectory: path.join(runtime, 'state'),
  printers: devices.map(device => ({ id: device.dev_id, model: device.dev_product_name || device.dev_model_name,
    camera: { ...common, printerId: device.dev_id, firmware: device.dev_model_name === 'N1' ? '01.08.01.00' : device.name.includes('H2D') ? '01.03.00.00' : '01.10.00.00' } })),
};
await fs.mkdir(runtime, { recursive: true, mode: 0o700 });
await fs.writeFile(path.join(runtime, 'config.json'), JSON.stringify(config, null, 2), { mode: 0o600 });
const envPath = path.join(root, '.env.local');
let env = await fs.readFile(envPath, 'utf8');
const values = { PRINTER_BRIDGE_URL: 'http://127.0.0.1:8787', PRINTER_BRIDGE_TOKEN: token,
  PRINTER_AUTOMATION_WORKER_SECRET: workerSecret, PRINTER_AUTOMATION_LIVE_ENABLED: 'false', PRINTER_AUTOMATION_APP_URL: 'http://localhost:3000' };
for (const [key, value] of Object.entries(values)) {
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  env = pattern.test(env) ? env.replace(pattern, `${key}=${value}`) : env.trimEnd() + `\n${key}=${value}\n`;
}
await fs.writeFile(envPath, env, { mode: 0o600 });
console.log(`Configured camera service for ${devices.length} bound printers; print starts remain disabled.`);
