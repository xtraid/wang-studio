import itertools
import random
import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.native_solver import prepare, solve
from server import Jobs


def instance(tiles, width=2, height=2):
    return dict(geometry='square', palette=['#ffffff','#000000'], tiles=tiles,
        cells=[dict(id=f'{x},{y}', required=[None]*4) for y in range(height) for x in range(width)])


def brute(data):
    cells = data['cells']; tiles = data['tiles']
    for choices in itertools.product(range(len(tiles)), repeat=len(cells)):
        assigned = {c['id']: tiles[t] for c,t in zip(cells,choices)}
        valid = True
        for c in cells:
            t = assigned[c['id']]; x,y = map(int,c['id'].split(','))
            if c.get('fixed') is not None and t != c['fixed']:
                valid = False; break
            if any(v is not None and t[d] != v for d,v in enumerate(c['required'])):
                valid = False; break
            for d,(dx,dy) in enumerate(((0,-1),(1,0),(0,1),(-1,0))):
                other = assigned.get(f'{x+dx},{y+dy}')
                if other is not None and t[d] != other[(d+2)%4]:
                    valid = False; break
        if valid:
            return True
    return False


class NativeTests(unittest.TestCase):
    def test_differential_against_exhaustive_search(self):
        rng = random.Random(8791)
        for _ in range(100):
            tiles = [[rng.randrange(2) for _ in range(4)] for _ in range(rng.randint(1,4))]
            data = instance(tiles)
            for cell in data['cells']:
                cell['required'] = [rng.choice([None,None,None,0,1]) for _ in range(4)]
            self.assertEqual(solve(data)['status']=='sat', brute(data))

    def test_32_tiles_and_pins(self):
        data = instance([[0]*4]*31+[[1]*4])
        data['cells'][0]['fixed'] = [1]*4
        result = solve(data)
        self.assertEqual(set(result['assignments'].values()), {31})
        data['cells'][1]['fixed'] = [0]*4
        self.assertEqual(solve(data)['status'], 'unsat')

    def test_negative_coordinates_hole_and_unused_palette(self):
        data = instance([[0]*4],3,3)
        data['palette'] += ['#123456']*80
        data['cells'] = [dict(c, id=f'{int(c["id"].split(",")[0])-20},{int(c["id"].split(",")[1])-20}') for c in data['cells'] if c['id']!='1,1']
        self.assertEqual(len(solve(data)['assignments']), 8)

    def test_validation(self):
        data=instance([[0]*4])
        for geometry in ['hex-flat','hex-point','tri-up','tri-side']:
            with self.assertRaises(ValueError): prepare(dict(data, geometry=geometry))
        with self.assertRaises(ValueError): prepare(dict(data,tiles=[[0]*4]*33))
        with self.assertRaises(ValueError): prepare(dict(data,cells=data['cells']*2))
        with self.assertRaises(ValueError): prepare(dict(data,tiles=[[True]*4]))
        data=instance([[0]*4]);data['cells'][0]['fixed']=[1]*4
        self.assertEqual(solve(data)['status'],'unsat')

    def test_jobs_complete_and_cancel(self):
        import time
        jobs=Jobs()
        try:
            id=jobs.start(instance([[0]*4]))
            for _ in range(100):
                result=jobs.get(id)
                if result['status']!='running': break
                time.sleep(.01)
            self.assertEqual(result['status'],'sat')
            id=jobs.start(instance([[0]*4]))
            self.assertIn(jobs.get(id,cancel=True)['status'],['cancelled','sat'])
            self.assertIsNotNone(jobs.jobs[id]['process'].poll())
        finally:
            jobs.close()

    def test_deadline_and_stop_terminate_native_process(self):
        import subprocess
        from unittest.mock import patch
        real_popen = subprocess.Popen
        def sleeping_worker(*args, **kwargs):
            return real_popen([sys.executable, '-c', 'import time; time.sleep(60)'], **kwargs)
        jobs = Jobs()
        try:
            with patch('server.subprocess.Popen', side_effect=sleeping_worker):
                id = jobs.start(dict(instance([[0]*4]), timeout_seconds=1))
                jobs.jobs[id]['started'] -= 2
                self.assertEqual(jobs.get(id)['status'], 'timeout')
                self.assertIsNotNone(jobs.jobs[id]['process'].poll())
                id = jobs.start(instance([[0]*4]))
                self.assertEqual(jobs.get(id, cancel=True)['status'], 'cancelled')
                self.assertIsNotNone(jobs.jobs[id]['process'].poll())
        finally:
            jobs.close()


if __name__=='__main__': unittest.main()
