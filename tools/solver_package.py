#!/usr/bin/env python3
"""Install or verify a pinned Foundry package; no Foundry checkout is required."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import shutil
import tarfile
import tempfile
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'dist/vendor/foundry'
LOCK = ROOT / 'solver.lock.json'
FILES = {'client.mjs', 'worker.mjs', 'prepare.mjs', 'foundry.mjs', 'foundry.wasm',
         'manifest.json', 'package.json', 'README.md', 'LICENSE'}
MAX_ARCHIVE = 10_000_000
MAX_UNPACKED = 30_000_000


def digest(data):
    return hashlib.sha256(data).hexdigest()


def validate(directory):
    if {p.name for p in directory.iterdir()} != FILES:
        raise ValueError('Il pacchetto deve contenere esattamente i file previsti.')
    manifest = json.loads((directory / 'manifest.json').read_text())
    if manifest.get('name') != '@tiling-foundry/solver-web' or manifest.get('api_version') != 1:
        raise ValueError('Pacchetto o versione API incompatibile.')
    if set(manifest.get('files', {})) != FILES - {'manifest.json'}:
        raise ValueError('Manifest incompleto.')
    for name, record in manifest['files'].items():
        data = (directory / name).read_bytes()
        if digest(data) != record['sha256'] or len(data) != record['size']:
            raise ValueError(f'Integrità del file non valida: {name}')
    descriptor = json.loads((directory / 'package.json').read_text())
    if descriptor.get('name') != manifest['name'] or descriptor.get('version') != manifest['version']:
        raise ValueError('Versioni del pacchetto discordanti.')
    return manifest


def verify():
    lock = json.loads(LOCK.read_text())
    manifest = validate(TARGET)
    if digest((TARGET / 'manifest.json').read_bytes()) != lock['manifest_sha256'] or manifest['version'] != lock['version']:
        raise ValueError('Il pacchetto installato non corrisponde al lock.')
    print(f"Verified {manifest['name']} {manifest['version']}")


def install(source, expected):
    if source.startswith('https://'):
        if not expected:
            raise ValueError('Per un download HTTPS specifica --sha256 ottenuto dalla release fidata.')
        with urlopen(source, timeout=60) as response:
            if not response.geturl().startswith('https://'):
                raise ValueError('Il download deve rimanere su HTTPS.')
            data = response.read(MAX_ARCHIVE + 1)
        origin = source
    else:
        path = Path(source).expanduser().resolve()
        with path.open('rb') as handle:
            data = handle.read(MAX_ARCHIVE + 1)
        origin = 'local:' + path.name
    if len(data) > MAX_ARCHIVE:
        raise ValueError('Archivio troppo grande.')
    checksum = digest(data)
    if expected and checksum != expected.lower():
        raise ValueError('SHA-256 dell’archivio non corrispondente.')
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.foundry-install-', dir=TARGET.parent) as temporary:
        staging = Path(temporary) / 'package'
        staging.mkdir()
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
            seen, total = set(), 0
            for entry in archive:
                name = entry.name.removeprefix('package/')
                if entry.name != 'package/' + name or name not in FILES or name in seen or not entry.isfile():
                    raise ValueError('Contenuto dell’archivio non ammesso.')
                total += entry.size
                if total > MAX_UNPACKED:
                    raise ValueError('Contenuto decompresso troppo grande.')
                seen.add(name)
                with archive.extractfile(entry) as handle:
                    (staging / name).write_bytes(handle.read())
        manifest = validate(staging)
        lock = dict(schema_version=1, package=manifest['name'], version=manifest['version'],
                    source=origin, archive_sha256=checksum,
                    manifest_sha256=digest((staging / 'manifest.json').read_bytes()))
        backup = Path(temporary) / 'previous'
        if TARGET.exists():
            TARGET.rename(backup)
        try:
            staging.rename(TARGET)
            lock_temp = LOCK.with_suffix('.tmp')
            lock_temp.write_text(json.dumps(lock, indent=2) + '\n')
            lock_temp.replace(LOCK)
        except Exception:
            if TARGET.exists():
                shutil.rmtree(TARGET)
            if backup.exists():
                backup.rename(TARGET)
            raise
    verify()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('verify')
    command = sub.add_parser('install')
    command.add_argument('source', help='Local archive or HTTPS release URL')
    command.add_argument('--sha256')
    args = parser.parse_args()
    try:
        if args.command == 'verify':
            verify()
        else:
            install(args.source, args.sha256)
    except (ValueError, OSError, KeyError, tarfile.TarError) as error:
        parser.exit(1, str(error) + '\n')


if __name__ == '__main__':
    main()
