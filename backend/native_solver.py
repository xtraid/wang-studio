"""Validate Studio instances and call Foundry's optimized runtime-tileset API.

No Z3 and no duplicated solver implementation. Invoked in a disposable process
so cancellation and deadlines actually stop native search.
"""
import ctypes as C
import json
from pathlib import Path
import re
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
OFFSETS = ((0, -1), (1, 0), (0, 1), (-1, 0))
MAX_CELLS = 4096
MAX_AREA = 16384


def prepare(data):
    if not isinstance(data, dict) or data.get('geometry') != 'square':
        raise ValueError('Il primo collegamento optimized supporta solo i quadrati.')
    palette, tiles, cells = data.get('palette'), data.get('tiles'), data.get('cells')
    if not isinstance(palette, list) or not 1 <= len(palette) <= 128 or not all(
        isinstance(c, str) and re.fullmatch(r'#[0-9a-fA-F]{6}', c) for c in palette
    ):
        raise ValueError('Palette non valida.')
    def edges(value, nullable=False):
        if not isinstance(value, list) or len(value) != 4 or not all(
            (nullable and v is None) or (type(v) is int and 0 <= v < len(palette)) for v in value
        ):
            raise ValueError('Una tessera o un vincolo contiene lati non validi.')
        return value
    if not isinstance(tiles, list) or not 1 <= len(tiles) <= 32:
        raise ValueError('Questo collegamento supporta da 1 a 32 tessere.')
    tiles = [edges(t) for t in tiles]
    if not isinstance(cells, list) or not 1 <= len(cells) <= MAX_CELLS:
        raise ValueError('La regione deve contenere da 1 a 4096 celle.')
    records = {}
    for c in cells:
        if not isinstance(c, dict) or not isinstance(c.get('id'), str) or not re.fullmatch(r'-?\d{1,7},-?\d{1,7}', c['id']):
            raise ValueError('Coordinate non valide.')
        xy = tuple(map(int, c['id'].split(',')))
        if xy in records or any(abs(v) > 1000000 for v in xy):
            raise ValueError('Coordinate duplicate o fuori intervallo.')
        records[xy] = dict(id=c['id'], required=edges(c.get('required'), True),
                           fixed=None if c.get('fixed') is None else edges(c['fixed']))
    x0, x1 = min(x for x, _ in records), max(x for x, _ in records)
    y0, y1 = min(y for _, y in records), max(y for _, y in records)
    width, height = x1-x0+1, y1-y0+1
    if width*height > MAX_AREA:
        raise ValueError('Il rettangolo della regione supera 16384 celle.')
    used = {n for t in tiles for n in t}
    for c in records.values():
        used.update(v for v in c['required'] if v is not None)
        if c['fixed'] is not None:
            used.update(c['fixed'])
    if len(used) > 16:
        raise ValueError('Questo primo collegamento supporta al massimo 16 colori usati.')
    # Palette identity follows editor indices; white is an ordinary color.
    remap = {v: i for i, v in enumerate(sorted(used))}
    area = width*height
    active, boundary, domains = [0]*area, [255]*(area*4), [0]*area
    indices = {}
    for (x, y), c in records.items():
        index = (y-y0)*width+x-x0
        indices[c['id']] = index
        active[index] = 1
        mask = 0
        for t, tile in enumerate(tiles):
            if c['fixed'] is not None and tile != c['fixed']:
                continue
            if all(v is None or tile[d] == v for d, v in enumerate(c['required'])):
                mask |= 1 << t
        domains[index] = mask
        for d, (dx, dy) in enumerate(OFFSETS):
            if (x+dx, y+dy) not in records and c['required'][d] is not None:
                boundary[index*4+d] = remap[c['required'][d]]
    return dict(width=width, height=height, active=active, boundary=boundary,
                domains=domains, edges=[remap[v] for t in tiles for v in t],
                indices=indices, tiles=tiles, records=records, palette=palette)


def solve(data):
    prepared = prepare(data)
    lib = C.CDLL(str(ROOT/'build/libstudio_bridge.so'))
    u8p, u32p, u64p = C.POINTER(C.c_uint8), C.POINTER(C.c_uint32), C.POINTER(C.c_uint64)
    lib.studio_solve.argtypes = [C.c_int32, C.c_int32, u8p, u8p, u8p, C.c_size_t, u32p, u8p, u64p]
    lib.studio_solve.restype = C.c_int
    arr = lambda typ, values: (typ*len(values))(*values)
    output = (C.c_uint8*len(prepared['active']))()
    metrics = (C.c_uint64*3)()
    started = time.monotonic()
    status = lib.studio_solve(prepared['width'], prepared['height'],
        arr(C.c_uint8, prepared['active']), arr(C.c_uint8, prepared['boundary']),
        arr(C.c_uint8, prepared['edges']), len(prepared['tiles']),
        arr(C.c_uint32, prepared['domains']), output, metrics)
    if status not in (0, 1):
        raise RuntimeError('Il solver optimized ha rifiutato l’istanza.')
    result = dict(status='sat' if status else 'unsat', solver='optimized',
        elapsed_ms=round((time.monotonic()-started)*1000, 2),
        metrics=dict(nodes=metrics[0], backtracks=metrics[1], reductions=metrics[2]))
    if status:
        assignments = {id: int(output[i]) for id, i in prepared['indices'].items()}
        # Independent postcondition check in Studio, in addition to Foundry's.
        for (x, y), cell in prepared['records'].items():
            tid = assignments[cell['id']]
            if not 0 <= tid < len(prepared['tiles']):
                raise RuntimeError('Il risultato contiene una tessera non valida.')
            tile = prepared['tiles'][tid]
            if cell['fixed'] is not None and tile != cell['fixed']:
                raise RuntimeError('Il risultato modifica una tessera fissata.')
            for d, (dx, dy) in enumerate(OFFSETS):
                required = cell['required'][d]
                neighbor = prepared['records'].get((x+dx, y+dy))
                if (required is not None and tile[d] != required) or (neighbor and tile[d] != prepared['tiles'][assignments[neighbor['id']]][(d+2)%4]):
                    raise RuntimeError('Il risultato non supera la verifica dei lati.')
        result['assignments'] = assignments
    return result


if __name__ == '__main__':
    try:
        print(json.dumps(solve(json.load(sys.stdin))))
    except Exception as error:
        print(json.dumps(dict(status='error', message=str(error))))
        sys.exit(1)


def enumerate_solutions(data, visitor):
    """Visit solutions in a single native DFS. visitor(snapshot, metrics)->bool.

    snapshot() is lazy and valid only inside the callback. Counting doesn't
    copy every assignment across the boundary. Python owns the unbounded count.
    """
    prepared = prepare(data)
    lib = C.CDLL(str(ROOT/'build/libstudio_bridge.so'))
    u8p, u32p, u64p = C.POINTER(C.c_uint8), C.POINTER(C.c_uint32), C.POINTER(C.c_uint64)
    callback_type = C.CFUNCTYPE(C.c_int, u32p, C.c_size_t, C.c_uint64, C.c_uint64, C.c_uint64, C.c_void_p)
    lib.studio_enumerate.argtypes = [C.c_int32,C.c_int32,u8p,u8p,u8p,C.c_size_t,u32p,callback_type,C.c_void_p,u64p]
    lib.studio_enumerate.restype = C.c_int
    errors = []
    def visit(domains, size, nodes, backtracks, reductions, unused):
        try:
            def snapshot():
                assigned = {}
                for id, index in prepared['indices'].items():
                    mask = int(domains[index])
                    if not mask or mask & (mask-1):
                        raise RuntimeError('Dominio non singleton in una soluzione.')
                    assigned[id] = mask.bit_length()-1
                for (x,y), cell in prepared['records'].items():
                    tile = prepared['tiles'][assigned[cell['id']]]
                    if cell['fixed'] is not None and tile != cell['fixed']:
                        raise RuntimeError('Una soluzione modifica una tessera fissata.')
                    for d,(dx,dy) in enumerate(OFFSETS):
                        required=cell['required'][d]
                        neighbor=prepared['records'].get((x+dx,y+dy))
                        if (required is not None and required != tile[d]) or (neighbor and tile[d]!=prepared['tiles'][assigned[neighbor['id']]][(d+2)%4]):
                            raise RuntimeError('Una soluzione contiene lati incompatibili.')
                return assigned
            return int(bool(visitor(snapshot, dict(nodes=nodes, backtracks=backtracks, reductions=reductions))))
        except Exception as error:
            errors.append(error)
            return 0
    callback = callback_type(visit)
    arr = lambda typ, values: (typ*len(values))(*values)
    metrics=(C.c_uint64*3)()
    status=lib.studio_enumerate(prepared['width'],prepared['height'],
        arr(C.c_uint8,prepared['active']),arr(C.c_uint8,prepared['boundary']),
        arr(C.c_uint8,prepared['edges']),len(prepared['tiles']),arr(C.c_uint32,prepared['domains']),
        callback,None,metrics)
    if errors:
        raise errors[0]
    if status not in (0,1):
        raise RuntimeError('Errore nella ricerca enumerativa optimized.')
    return dict(complete=status==0,metrics=dict(nodes=metrics[0],backtracks=metrics[1],reductions=metrics[2]))
