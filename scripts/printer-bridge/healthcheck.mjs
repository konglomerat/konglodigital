import fs from 'node:fs/promises';
const config = JSON.parse(await fs.readFile(process.env.PRINTER_BRIDGE_CONFIG, 'utf8'));
const token = process.env.PRINTER_BRIDGE_TOKEN || config.token;
const response = await fetch(`http://127.0.0.1:${config.port ?? 8787}/v1/health`, {
  headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000),
});
if (!response.ok || (await response.json()).version !== 1) process.exitCode = 1;
