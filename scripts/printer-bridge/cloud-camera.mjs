import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
const ffmpeg = process.env.FFMPEG_PATH || (await import('ffmpeg-static')).default;

// Native plugin output can contain credentials. Only numeric diagnostic keys on
// fd 3 are accepted; stdout/stderr are discarded, including on process errors.
export function runCameraProcess(command, args, input, { signal, diagnosticFd = 3 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Camera request timed out'));
    const proc = spawn(command, args, { shell: false, stdio: ['pipe', diagnosticFd === 1 ? 'pipe' : 'ignore', 'ignore', ...(diagnosticFd === 3 ? ['pipe'] : [])] });
    let diagnostics = ''; let oversized = false;
    const abort = () => proc.kill('SIGKILL');
    signal?.addEventListener('abort', abort, { once: true });
    const clean = () => signal?.removeEventListener('abort', abort);
    const output = diagnosticFd === 1 ? proc.stdout : proc.stdio[3];
    output?.on('data', bytes => { diagnostics += bytes.toString(); if (diagnostics.length > 16_384) { oversized = true; abort(); } });
    proc.stdin.on('error', () => {});
    proc.on('error', () => { clean(); reject(new Error('Camera helper unavailable')); });
    proc.on('close', code => {
      clean();
      const values = Object.fromEntries(diagnostics.split('\n').filter(line => /^[a-z_]+=-?\d+$/.test(line)).map(line => { const [key, value] = line.split('='); return [key, Number(value)]; }));
      if (code !== 0 || signal?.aborted || oversized) return reject(new Error(`${signal?.aborted ? 'Camera request timed out' : 'Camera helper failed'}: ${JSON.stringify(values)}`));
      resolve(values);
    });
    proc.stdin.end(input);
  });
}

async function cloudSession(camera, signal) {
  const { printerId } = camera;
  const stored = camera.credentials ?? JSON.parse(await fs.readFile(camera.tokenStorePath, 'utf8'));
  if (!stored.token || !Number.isFinite(stored.expiresAt) || stored.expiresAt <= Date.now()) throw new Error('Bambu login expired; refresh app status');
  const api = async endpoint => {
    const response = await fetch(`https://api.bambulab.com${endpoint}`, { headers: {
      Authorization: `Bearer ${stored.token}`, Accept: 'application/json',
      'User-Agent': 'bambu_network_agent/02.08.02.61', 'X-BBL-Client-Name': 'BambuStudio', 'X-BBL-Client-Type': 'slicer', 'X-BBL-OS-Type': 'linux',
    }, signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]), redirect: 'error' });
    if (!response.ok) throw new Error('Bambu cloud login unavailable');
    return response.json();
  };
  const [bound, profile] = await Promise.all([api('/v1/iot-service/api/user/bind'), api('/v1/user-service/my/profile')]);
  if (!bound.devices?.some(device => device.dev_id === printerId)) throw new Error('Printer does not belong to cloud account');
  const uid = String(profile.uidStr || profile.uid || '');
  if (!uid) throw new Error('Bambu account identity unavailable');
  return JSON.stringify({ command: 'user_login', data: { token: stored.token, refresh_token: stored.refreshToken,
    expires_in: String(Math.floor((stored.expiresAt - Date.now()) / 1000)), refresh_expires_in: '31536000',
    user: { uid, name: profile.name || '', account: profile.account || '', avatar: profile.avatar || '' } } });
}

let activeCaptures = 0;
export async function captureCloudCamera(camera) {
  if (!['darwin', 'linux'].includes(process.platform)) throw new Error('Unsupported camera platform');
  const nativeLinux = process.platform === 'linux';
  if (activeCaptures >= 4) throw new Error('Cloud camera capacity busy; retry later');
  activeCaptures++;
  const signal = AbortSignal.timeout(90_000);
  let directory;
  const container = `konglo-camera-${randomUUID()}`;
  try {
    const login = await cloudSession(camera, signal);
    await fs.mkdir(camera.workDirectory, { recursive: true, mode: 0o700 });
    directory = await fs.mkdtemp(path.join(camera.workDirectory, 'capture-'));
    const input = [nativeLinux ? path.join(camera.networkSdkDirectory, 'libbambu_networking.so') : '/sdk/libbambu_networking.so', '', nativeLinux ? directory : '/session', login, camera.printerId, camera.firmware, '/session/unused', '02.08.02.61'].join('\n') + '\n';
    const args = ['run', '--rm', '--name', container, '--label', 'konglo.printer-camera=true', '--platform', 'linux/arm64', '--cpus', '2', '--memory', '1g', '--pids-limit', '256', '-i',
      '-e', 'SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt', '-e', 'SSL_CERT_DIR=/etc/ssl/certs', '-e', 'CURL_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt',
      '-v', `${camera.networkSdkDirectory}:/sdk:ro`, '-v', `${camera.authorizeBinary}:/authorize:ro`, '-v', `${directory}:/session`,
      '-v', `${camera.certificateDirectory}:/Applications/BambuStudio.app/Contents/Resources/cert:ro`, camera.dockerImage,
      'bash', '-c', 'exec qemu-x86_64 -L /amd64 /authorize 3>&1 1>/dev/null 2>/dev/null'];
    let authorization;
    try {
      authorization = nativeLinux
        ? await runCameraProcess(camera.authorizeBinary, [], input, { signal })
        : await runCameraProcess(camera.dockerPath, args, input, { signal, diagnosticFd: 1 });
    } catch (error) {
      if (/light_confirmation_(timeout|lost)/.test(error.message)) {
        const lightError = new Error('Printer light could not be confirmed');
        lightError.code = 'LIGHT_UNCONFIRMED';
        throw lightError;
      }
      throw error;
    }
    if (authorization.lights_on_confirmed !== 1) {
      const error = new Error('Printer light could not be confirmed');
      error.code = 'LIGHT_UNCONFIRMED';
      throw error;
    }
    const urlFile = path.join(directory, 'camera-url');
    const url = await fs.readFile(urlFile, 'utf8');
    await fs.unlink(urlFile);
    if (!/^bambu:\/\/\/(tutk|agora)\?/.test(url) || /[\r\n]/.test(url)) throw new Error('Invalid cloud camera response');
    const output = path.join(directory, 'camera.bin');
    const result = await runCameraProcess(camera.receiverBinary, [], [camera.sourceLibrary, url, output].join('\n') + '\n', { signal });
    const capturedAt = new Date(result.captured_at_ms).toISOString();
    if (result.frames < 2 || Date.now() - result.captured_at_ms > 30_000 || result.captured_at_ms > Date.now() + 2_000) throw new Error('Camera returned no fresh frames');
    if (result.codec !== 1) {
      if (result.codec !== 0) throw new Error('Unsupported camera codec');
      // Decode the received sequence to its last frame. No stale file can be
      // reused: every request has a newly created private directory.
      await runCameraProcess(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'h264', '-i', output, '-an', '-update', '1', '-q:v', '3', path.join(directory, 'camera.jpg')], '', { signal, diagnosticFd: 1 });
    }
    const raw = await fs.readFile(result.codec === 1 ? output : path.join(directory, 'camera.jpg'));
    if (raw.length > 4 * 1024 * 1024) throw new Error('Camera image too large');
    const image = sharp(raw, { limitInputPixels: 12_000_000 });
    const info = await image.metadata();
    if (info.format !== 'jpeg' || !info.width || !info.height || info.width < 320 || info.height < 240) throw new Error('Invalid camera image');
    return { jpeg: raw, capturedAt };
  } finally {
    // Killing the Docker client alone does not stop its container.
    if (!nativeLinux) await runCameraProcess(camera.dockerPath, ['rm', '-f', container], '', { signal: AbortSignal.timeout(5_000), diagnosticFd: 1 }).catch(() => {});
    if (directory) await fs.rm(directory, { recursive: true, force: true });
    activeCaptures--;
  }
}
