import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
if (process.platform !== 'darwin') throw new Error('This installer requires macOS launchd');
process.umask(0o077);
const project = process.cwd();
const runtime = path.resolve('.data/printer-bridge-runtime');
await fs.access(path.join(runtime, 'config.json'));
const agents = path.join(os.homedir(), 'Library/LaunchAgents');
await fs.mkdir(agents, { recursive: true });
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
for (const [name, args] of [
  ['printer-bridge', [path.join(project, 'scripts/printer-bridge/server.mjs')]],
  ['printer-worker', [path.join(project, 'scripts/printer-automation-worker.mjs'), '--watch']],
]) {
  const label = `org.konglomerat.${name}`;
  const file = path.join(agents, `${label}.plist`);
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${[process.execPath, ...args].map(value => `<string>${xml(value)}</string>`).join('')}</array>
<key>WorkingDirectory</key><string>${xml(project)}</string>
<key>EnvironmentVariables</key><dict><key>PRINTER_BRIDGE_CONFIG</key><string>${xml(path.join(runtime, 'config.json'))}</string><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer><key>Umask</key><integer>63</integer>
<key>StandardOutPath</key><string>${xml(path.join(runtime, `${name}.log`))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(runtime, `${name}.error.log`))}</string>
</dict></plist>`;
  await fs.writeFile(file, plist, { mode: 0o600 });
  const domain = `gui/${process.getuid()}`;
  try { execFileSync('/bin/launchctl', ['bootout', `${domain}/${label}`], { stdio: 'pipe' }); } catch {}
  // bootout can return while launchd still removes the old registration.
  for (let attempt = 0; ; attempt++) {
    try { execFileSync('/bin/launchctl', ['bootstrap', domain, file], { stdio: 'pipe' }); break; }
    catch (error) { if (attempt >= 5) throw error; await sleep(500); }
  }
  console.log(`Started ${label}`);
}
