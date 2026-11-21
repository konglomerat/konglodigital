"""Package the current checkout for Dokploy Drop without secrets or local build files."""
from pathlib import Path
import io
import subprocess
import sys
import tarfile
import zipfile

root = Path(__file__).resolve().parent.parent
output = Path(sys.argv[1]).resolve()
files = set(subprocess.check_output(
    ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=root
).decode().split('\0'))
files.update(str(p.relative_to(root)) for p in (root / 'public/media').rglob('*') if p.is_file())
source = io.BytesIO()
# Dokploy's filename validation rejects some valid upload/Next.js filenames.
# Extract only our locally constructed tar during the container build.
with tarfile.open(fileobj=source, mode='w:gz', compresslevel=9) as archive:
    for name in sorted(files):
        path = root / name
        if (not name or not path.is_file() or path.is_symlink()
            or any(part.startswith('.env') for part in Path(name).parts)
            or '.db-backups' in Path(name).parts
            or path.suffix in {'.log', '.zip', '.tsbuildinfo', '.md'}):
            continue
        if name.startswith('src/endpoints/seed/image-') and path.suffix == '.webp':
            continue
        if name.startswith('src/migrations/') and path.suffix == '.json':
            continue
        if name in {'public/website-template-OG.webp', 'package.json', 'package-lock.json', 'nixpacks.toml'}:
            continue
        archive.add(path, arcname=name, recursive=False)
config = (root / 'nixpacks.toml').read_text() + '''\n[phases.install]\ncmds = ["tar -xzf source.tar.gz && rm source.tar.gz", "npm ci --no-audit --no-fund"]\n'''
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    archive.writestr('source.tar.gz', source.getvalue())
    archive.writestr('nixpacks.toml', config)
    for name in ['package.json', 'package-lock.json']:
        archive.write(root / name, name)
output.chmod(0o600)
print(f'Deployment archive: {output.stat().st_size} bytes')
