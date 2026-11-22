import { spawn } from 'node:child_process'
import path from 'node:path'

export function localMediaURL(collection: string, filename: string) {
  const origin = process.env.PAYLOAD_MEDIA_PUBLIC_ORIGIN || process.env.NEXT_PUBLIC_SERVER_URL || ''
  return `${origin}/api/${collection}/file/${encodeURIComponent(filename)}`
}

/** Local editing uses the same persistent volume as the deployed CMS. */
export async function writeSharedFile(filename: string, bytes: Uint8Array): Promise<boolean> {
  const host = process.env.PAYLOAD_MEDIA_SSH_HOST
  if (!host) return false
  const directory = process.env.PAYLOAD_MEDIA_REMOTE_DIR
  if (!/^[a-zA-Z0-9._@-]+$/.test(host) || !directory?.startsWith('/') || path.basename(filename) !== filename) {
    throw new Error('Ungültige Konfiguration des gemeinsamen Medienspeichers.')
  }
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
  const program = 'import os,sys,tempfile; p=sys.argv[1]; fd,tmp=tempfile.mkstemp(dir=os.path.dirname(p)); f=os.fdopen(fd,"wb"); f.write(sys.stdin.buffer.read()); f.close(); os.chmod(tmp,0o644); os.replace(tmp,p)'
  await new Promise<void>((resolve, reject) => {
    const child = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host,
      `python3 -c ${quote(program)} ${quote(path.posix.join(directory, filename))}`], { stdio: ['pipe', 'ignore', 'pipe'] })
    child.on('error', reject)
    child.stdin.on('error', reject)
    child.stderr.resume()
    child.once('close', code => code === 0 ? resolve() : reject(new Error('Gemeinsamer Medienspeicher nicht erreichbar. Datei wurde nicht gespeichert.')))
    child.stdin.end(bytes)
  })
  return true
}
