import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const base = process.env.PRINTER_AUTOMATION_APP_URL;
const secret = process.env.PRINTER_AUTOMATION_WORKER_SECRET;
if (!base || !secret || secret.length < 32) throw new Error('Configure PRINTER_AUTOMATION_APP_URL and PRINTER_AUTOMATION_WORKER_SECRET (at least 32 characters).');
const url = new URL('/api/internal/printer-automation/tick', base);
if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Use HTTPS or loopback');
if (url.username || url.password) throw new Error('Do not embed credentials in the app URL');
let stopped = false;
const controller = new AbortController();
process.on('SIGINT', () => { stopped = true; controller.abort(); });
process.on('SIGTERM', () => { stopped = true; controller.abort(); });
do {
  try {
    const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${secret}` },
      redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(115_000)]) });
    if (!response.ok) throw new Error(`Worker HTTP ${response.status}`);
    await response.json();
    console.log(`${new Date().toISOString()} Printer automation checked`);
  } catch (error) {
    if (!stopped) { console.error(error instanceof Error ? error.message : 'Worker failed'); if (!process.argv.includes('--watch')) process.exitCode = 1; }
  }
  if (!process.argv.includes('--watch') || stopped) break;
  const { setTimeout: sleep } = await import('node:timers/promises');
  await sleep(30_000, undefined, { signal: controller.signal }).catch(() => {});
} while (!stopped);
