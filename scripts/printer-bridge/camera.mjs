import tls from 'node:tls';
import { createHash, timingSafeEqual } from 'node:crypto';

export function cameraAuthPacket(accessCode) {
  if (typeof accessCode !== 'string' || !/^[\x21-\x7e]{1,32}$/.test(accessCode)) throw new Error('Invalid LAN access code');
  const packet = Buffer.alloc(80);
  packet.writeUInt32LE(0x40, 0);
  packet.writeUInt32LE(0x3000, 4);
  packet.write('bblp', 16, 'ascii');
  packet.write(accessCode, 48, 'ascii');
  return packet;
}

export function createJpegFrameReader(onFrame) {
  let pending = Buffer.alloc(0);
  let expected = null;
  return chunk => {
    pending = Buffer.concat([pending, chunk]);
    while (true) {
      if (expected === null) {
        if (pending.length < 16) return;
        expected = pending.readUInt32LE(0);
        if (expected < 4 || expected > 4 * 1024 * 1024 || pending.readUInt32LE(4) !== 0) throw new Error('Invalid camera frame header');
        pending = pending.subarray(16);
      }
      if (pending.length < expected) return;
      const jpeg = pending.subarray(0, expected);
      pending = pending.subarray(expected);
      expected = null;
      if (jpeg.readUInt16BE(0) !== 0xffd8 || jpeg.readUInt16BE(jpeg.length - 2) !== 0xffd9) throw new Error('Invalid JPEG frame');
      onFrame(Buffer.from(jpeg));
    }
  };
}

export function captureJpeg(config, { connect = tls.connect, timeoutMs = 12_000 } = {}) {
  const fingerprint = config.certificateSha256?.replaceAll(':', '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(fingerprint ?? '')) throw new Error('A pinned printer certificate is required');
  const packet = cameraAuthPacket(config.accessCode);
  return new Promise((resolve, reject) => {
    let settled = false;
    let authenticated = false;
    let frames = 0;
    // Bambu uses a device certificate. Verify its configured SHA-256 pin BEFORE
    // sending the access code instead of accepting an arbitrary self-signed peer.
    const socket = connect({ host: config.host, port: config.port ?? 6000, rejectUnauthorized: false });
    const finish = (error, image) => {
      if (settled) return;
      settled = true; clearTimeout(timer); socket.destroy();
      if (error) reject(error); else resolve(image);
    };
    const timer = setTimeout(() => finish(new Error('Camera timeout')), timeoutMs);
    socket.once('secureConnect', () => {
      try {
        const raw = socket.getPeerCertificate().raw;
        if (!raw || !timingSafeEqual(createHash('sha256').update(raw).digest(), Buffer.from(fingerprint, 'hex'))) {
          return finish(new Error('Printer certificate mismatch'));
        }
        authenticated = true;
        socket.write(packet);
      } catch { finish(new Error('Printer certificate validation failed')); }
    });
    const read = createJpegFrameReader(jpeg => {
      // Skip the initial frame to avoid using a warm-up/cached image.
      if (++frames >= 2) finish(null, { jpeg, capturedAt: new Date().toISOString() });
    });
    socket.on('data', chunk => {
      if (!authenticated || settled) return;
      try { read(chunk); } catch { finish(new Error('Invalid camera stream')); }
    });
    socket.on('error', () => finish(new Error('Camera connection failed')));
    socket.on('end', () => finish(new Error('Camera stream ended before a fresh frame arrived')));
    socket.on('close', () => { if (!settled) finish(new Error('Camera connection closed')); });
  });
}
