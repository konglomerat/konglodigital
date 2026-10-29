import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('This build is for Apple Silicon');
const output = path.resolve('.data/printer-bridge-runtime');
await fs.mkdir(output, { recursive: true, mode: 0o700 });
const include = path.join(output, 'include');
const jsonHeader = path.join(include, 'nlohmann/json.hpp');
const jsonHash = '9bea4c8066ef4a1c206b2be5a36302f8926f7fdc6087af5d20b417d0cf103ea6';
let header = await fs.readFile(jsonHeader).catch(() => null);
if (!header || createHash('sha256').update(header).digest('hex') !== jsonHash) {
  const response = await fetch('https://raw.githubusercontent.com/nlohmann/json/v3.11.3/single_include/nlohmann/json.hpp', { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error('JSON header download failed');
  header = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(header).digest('hex') !== jsonHash) throw new Error('JSON header checksum mismatch');
  await fs.mkdir(path.dirname(jsonHeader), { recursive: true, mode: 0o700 });
  await fs.writeFile(jsonHeader, header, { mode: 0o600 });
}
execFileSync('/usr/bin/codesign', ['--verify', '--strict', path.resolve('.data/bambu-cloud-probe/sdk-02.08.01.53/libBambuSource.dylib')], { stdio: 'pipe' });
const lightTest = path.join(output, 'light-state-test');
execFileSync('/usr/bin/clang++', ['-std=c++17', '-O2', `-I${include}`, 'scripts/printer-bridge/native/light-state.test.cpp', '-o', lightTest], { stdio: 'inherit' });
execFileSync(lightTest, [], { stdio: 'inherit' });
execFileSync('/usr/bin/clang++', ['-std=c++17', '-O2', 'scripts/printer-bridge/native/receive.cpp', '-framework', 'CoreFoundation', '-o', path.join(output, 'receive.next')], { stdio: 'inherit' });
execFileSync('/usr/local/bin/docker', ['run', '--rm', '--platform', 'linux/amd64', '-v', `${path.resolve('scripts/printer-bridge/native')}:/source:ro`, '-v', `${output}:/output`,
  'konglo-bambu-camera-probe:local', 'g++', '-std=c++17', '-O2', '-I/output/include', '/source/authorize.cpp', '-ldl', '-lpthread', '-o', '/output/authorize-linux.next'], { stdio: 'inherit' });
await fs.rename(path.join(output, 'receive.next'), path.join(output, 'receive'));
await fs.rename(path.join(output, 'authorize-linux.next'), path.join(output, 'authorize-linux'));
console.log('Camera helpers built. Original Bambu libraries are not included in this repository.');
