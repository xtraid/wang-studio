#!/usr/bin/env python3
"""Local Wang Studio service. Only the native bridge performs solving."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import urlsplit
import uuid

from backend.native_solver import prepare
ROOT = Path(__file__).resolve().parent


def build(foundry):
    foundry = Path(foundry).expanduser().resolve()
    subprocess.run(['make', '-C', str(foundry), 'shared'], check=True)
    (ROOT/'build').mkdir(exist_ok=True)
    subprocess.run(['cc', '-std=c17', '-Wall', '-Wextra', '-Werror', '-O2', '-fPIC', '-shared',
        '-I'+str(foundry/'include'), str(ROOT/'backend/optimized_bridge.c'),
        '-L'+str(foundry/'build/lib'), '-lwang', '-Wl,-rpath,'+str(foundry/'build/lib'),
        '-o', str(ROOT/'build/libstudio_bridge.so')], check=True)


class Jobs:
    def __init__(self):
        self.jobs = {}
        self.lock = threading.RLock()

    def start(self, payload):
        prepare(payload)
        timeout = payload.get('timeout_seconds', 30)
        if type(timeout) not in (int, float) or not 1 <= timeout <= 120:
            raise ValueError('Tempo limite non valido (1–120 secondi).')
        enumerating = payload.get('operation') == 'enumerate'
        if enumerating and payload.get('enumeration_mode', 'step') not in ('step', 'count'):
            raise ValueError('Modalità di enumerazione non valida.')
        with self.lock:
            self.reap()
            if any(j['result'] is None for j in self.jobs.values()):
                raise ValueError('È già presente una ricerca. Premi Stop prima di avviarne un’altra.')
            source, output, errors = tempfile.TemporaryFile(), tempfile.TemporaryFile(), tempfile.TemporaryFile()
            source.write(json.dumps(payload).encode()); source.seek(0)
            directory = tempfile.TemporaryDirectory(prefix='wang-enumeration-') if enumerating else None
            args = [sys.executable, str(ROOT/'backend/native_solver.py')]
            if enumerating:
                args = [sys.executable, str(ROOT/'backend/enumeration_worker.py'),
                        str(Path(directory.name)/'progress.json'), str(Path(directory.name)/'control.json')]
            try:
                process = subprocess.Popen(args, stdin=source, stdout=output, stderr=errors, cwd=ROOT)
            except Exception:
                source.close(); output.close(); errors.close()
                if directory: directory.cleanup()
                raise
            id = uuid.uuid4().hex
            self.jobs[id] = dict(process=process, files=(source, output, errors),
                started=time.monotonic(), phase_started=time.monotonic(), timeout=timeout, result=None,
                enumerating=enumerating, directory=directory, generation=0,
                progress=dict(status='running', solver='optimized', count='0', exact=False, generation=0))
            return id

    def progress(self, job):
        if job['enumerating'] and job['result'] is None:
            try:
                value = json.loads((Path(job['directory'].name)/'progress.json').read_text())
                if value.get('generation', 0) == job['generation']:
                    if value['status'] != job['progress']['status']:
                        job['phase_started'] = time.monotonic()
                    job['progress'] = value
            except (FileNotFoundError, ValueError, OSError):
                pass
        return job['progress']

    def finish(self, job, forced=None):
        if job['result'] is not None: return
        process = job['process']
        if forced:
            if process.poll() is None:
                process.terminate()
                try: process.wait(timeout=1)
                except subprocess.TimeoutExpired:
                    process.kill(); process.wait()
            if job['enumerating']:
                result = dict(self.progress(job), status=forced, exact=False)
            else: result = dict(status=forced, solver='optimized')
        elif job['enumerating']:
            result = dict(self.progress(job))
            if result['status'] not in ('complete', 'error'):
                result.update(status='error', exact=False, message='La ricerca si è interrotta prima di completare il conteggio.')
        else:
            job['files'][1].seek(0)
            try: result = json.load(job['files'][1])
            except (ValueError, UnicodeError):
                result = dict(status='error', message='Il processo optimized si è interrotto.')
        for file in job['files']: file.close()
        if job['directory']: job['directory'].cleanup()
        job['result'] = result

    def reap(self):
        with self.lock:
            for id, job in list(self.jobs.items()):
                if job['result'] is None:
                    progress = self.progress(job)
                    if job['enumerating'] and progress['status'] in ('complete', 'error') and job['process'].poll() is None:
                        try: job['process'].wait(timeout=.1)
                        except subprocess.TimeoutExpired: pass
                    if job['process'].poll() is not None:
                        self.finish(job)
                    elif job['enumerating'] and progress['status'] == 'paused':
                        if time.monotonic()-job['phase_started'] > 600:
                            self.finish(job, 'expired')
                    elif time.monotonic()-(job['phase_started'] if job['enumerating'] else job['started']) > job['timeout']:
                        self.finish(job, 'timeout')
                elif time.monotonic()-job['started'] > 600:
                    del self.jobs[id]

    def get(self, id, cancel=False):
        with self.lock:
            self.reap()
            job = self.jobs.get(id)
            if job is None: return None
            if cancel: self.finish(job, 'cancelled')
            return job['result'] or (self.progress(job) if job['enumerating'] else dict(status='running', solver='optimized'))

    def resume(self, id, action):
        with self.lock:
            self.reap()
            job = self.jobs.get(id)
            if action not in ('next', 'count') or not job or not job['enumerating'] or job['result'] is not None or self.progress(job)['status'] != 'paused':
                raise ValueError('La ricerca non è in attesa di una soluzione successiva.')
            job['generation'] += 1
            command = Path(job['directory'].name)/'control.json'
            temporary = command.with_suffix('.tmp')
            temporary.write_text(json.dumps(dict(action=action, generation=job['generation'])))
            os.replace(temporary, command)
            job['progress'] = dict(job['progress'], status='running', exact=False,
                                   generation=job['generation'])
            job['phase_started'] = time.monotonic()
            return job['progress']

    def close(self):
        with self.lock:
            for job in self.jobs.values(): self.finish(job, 'cancelled')


JOBS = Jobs()


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def response(self, code, value):
        body = json.dumps(value).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def allowed(self):
        host = self.headers.get('Host', '')
        accepted = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
        origin = self.headers.get('Origin')
        if host not in accepted or (origin is not None and origin != 'http://'+host):
            self.response(403, dict(message='Usa l’indirizzo locale di Wang Studio.'))
            return False
        return True

    def do_GET(self):
        if not self.allowed():
            return
        path = urlsplit(self.path).path
        if path == '/api/capabilities':
            self.response(200, dict(solver='optimized', geometries=['square'], max_tiles=32,
                max_used_colors=16, max_cells=4096, default_timeout_seconds=30, enumeration=True, duplicate_tiles='collapsed'))
        elif path.startswith('/api/jobs/'):
            result = JOBS.get(path.rsplit('/', 1)[-1])
            self.response(200 if result else 404, result or dict(message='Ricerca non trovata.'))
        elif path.startswith('/api/'):
            self.response(404, dict(message='Endpoint non trovato.'))
        else:
            super().do_GET()

    def do_POST(self):
        if not self.allowed(): return
        path = urlsplit(self.path).path
        resume = path.startswith('/api/jobs/') and path.endswith('/resume')
        if path not in ('/api/solve', '/api/enumerate') and not resume:
            self.response(404, dict(message='Endpoint non trovato.')); return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 2_000_000:
                raise ValueError('Richiesta troppo grande o vuota.')
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict): raise ValueError('Richiesta non valida.')
            if resume:
                result = JOBS.resume(path.split('/')[-2], payload.get('action'))
                self.response(202, result)
            else:
                if path == '/api/enumerate': payload['operation'] = 'enumerate'
                else: payload.pop('operation', None)
                id = JOBS.start(payload)
                self.response(202, dict(id=id, status='running', solver='optimized'))
        except (ValueError, TypeError) as error:
            self.response(400, dict(message=str(error)))
        except Exception:
            self.response(500, dict(message='Impossibile avviare optimized.'))

    def do_DELETE(self):
        if not self.allowed():
            return
        path = urlsplit(self.path).path
        result = JOBS.get(path.rsplit('/', 1)[-1], cancel=True) if path.startswith('/api/jobs/') else None
        self.response(200 if result else 404, result or dict(message='Ricerca non trovata.'))


def main():
    parser = argparse.ArgumentParser(description='Wang Studio · Tiling Foundry research companion')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--foundry', default=os.environ.get('TILING_FOUNDRY_ROOT', str(Path.home()/'tiling-foundry')))
    parser.add_argument('--no-build', action='store_true')
    parser.add_argument('--build-only', action='store_true')
    args = parser.parse_args()
    if not args.no_build:
        build(args.foundry)
    if args.build_only:
        return
    if not (ROOT/'build/libstudio_bridge.so').is_file():
        parser.error('Bridge mancante: avvia senza --no-build.')
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(ROOT/'dist')))
    def reap():
        while True:
            time.sleep(.25)
            JOBS.reap()
    threading.Thread(target=reap, daemon=True).start()
    print(f'Wang Studio · optimized: http://127.0.0.1:{args.port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        JOBS.close(); server.server_close()


if __name__ == '__main__':
    main()
