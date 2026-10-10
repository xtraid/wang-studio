import itertools
import random
import sys
from pathlib import Path
import time
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.native_solver import enumerate_solutions
from server import Jobs
from test_native_solver import instance


def all_brute(data):
    found=set();cells=data['cells'];tiles=data['tiles']
    for ids in itertools.product(range(len(tiles)),repeat=len(cells)):
        placed={c['id']:tiles[t] for c,t in zip(cells,ids)}
        valid=True
        for c in cells:
            tile=placed[c['id']];x,y=map(int,c['id'].split(','))
            if c.get('fixed') is not None and tile!=c['fixed']:valid=False;break
            if any(v is not None and tile[d]!=v for d,v in enumerate(c['required'])):valid=False;break
            for d,(dx,dy) in enumerate(((0,-1),(1,0),(0,1),(-1,0))):
                other=placed.get(f'{x+dx},{y+dy}')
                if other is not None and tile[d]!=other[(d+2)%4]:valid=False;break
        if valid:found.add(tuple(tuple(tiles[t]) for t in ids))
    return found


def enumerate_all(data):
    found=[]
    def visitor(snapshot,metrics):
        result=snapshot()
        found.append(tuple(tuple(data['tiles'][result[c['id']]]) for c in data['cells']))
        return True
    status=enumerate_solutions(data,visitor)
    return status,found


class EnumerationTests(unittest.TestCase):
    def test_exact_set_against_bruteforce(self):
        rng=random.Random(17821)
        for _ in range(100):
            tiles=[[rng.randrange(2) for _ in range(4)] for _ in range(rng.randint(1,4))]
            data=instance(tiles)
            if rng.random()<.5:
                data['cells'][rng.randrange(4)]['required'][rng.randrange(4)]=rng.randrange(2)
            expected=all_brute(data)
            status,found=enumerate_all(data)
            self.assertTrue(status['complete'])
            self.assertEqual(len(found),len(set(found)),'No repeated tilings')
            self.assertEqual(set(found),expected)

    def test_duplicates_isolated_disconnected_and_32_tiles(self):
        data=instance([[0]*4,[1]*4,[0]*4],1,1)
        self.assertEqual(len(enumerate_all(data)[1]),2)
        data['cells'].append(dict(id='3,3',required=[None]*4))
        self.assertEqual(len(enumerate_all(data)[1]),4)
        data['cells'][0]['fixed']=[0]*4
        self.assertEqual(len(enumerate_all(data)[1]),2)
        data=instance([[n%16,n//16,0,0] for n in range(32)],1,1)
        data['palette']=['#ffffff']*16
        self.assertEqual(len(enumerate_all(data)[1]),32)

    def test_known_closed_square_count(self):
        data=instance([list(t) for t in itertools.product(range(2),repeat=4)])
        for c in data['cells']:
            x,y=map(int,c['id'].split(','))
            c['required']=[0 if y==0 else None,0 if x==1 else None,0 if y==1 else None,0 if x==0 else None]
        self.assertEqual(len(enumerate_all(data)[1]),16)
        data['cells'][0]['fixed']=[0]*4
        self.assertEqual(len(enumerate_all(data)[1]),4)

    def test_visitor_can_stop(self):
        seen=[]
        result=enumerate_solutions(instance([[0]*4,[1]*4],1,1),lambda snapshot,metrics:seen.append(snapshot()) or False)
        self.assertFalse(result['complete']);self.assertEqual(len(seen),1)

    def wait(self,jobs,id):
        for _ in range(500):
            value=jobs.get(id)
            if value['status']!='running':return value
            time.sleep(.005)
        self.fail('Enumeration did not produce a result')

    def test_next_retains_process_and_exhausts_exactly(self):
        jobs=Jobs()
        try:
            id=jobs.start(dict(instance([[0]*4,[1]*4,[0]*4],1,1),operation='enumerate'))
            pid=jobs.jobs[id]['process'].pid
            first=self.wait(jobs,id);self.assertEqual(first['status'],'paused');self.assertEqual(first['count'],'1');self.assertFalse(first['exact'])
            jobs.resume(id,'next');second=self.wait(jobs,id)
            self.assertEqual(jobs.jobs[id]['process'].pid,pid);self.assertEqual(second['count'],'2');self.assertNotEqual(first['assignments'],second['assignments'])
            jobs.resume(id,'next');last=self.wait(jobs,id)
            self.assertEqual(last['status'],'complete');self.assertEqual(last['count'],'2');self.assertTrue(last['exact'])
        finally:jobs.close()

    def test_count_resumes_from_current_solution(self):
        jobs=Jobs()
        try:
            id=jobs.start(dict(instance([[0]*4,[1]*4],1,1),operation='enumerate'))
            self.wait(jobs,id);jobs.resume(id,'count');result=self.wait(jobs,id)
            self.assertEqual(result['count'],'2');self.assertTrue(result['exact'])
        finally:jobs.close()

    def test_stop_keeps_lower_bound_and_pauses_dont_timeout(self):
        jobs=Jobs()
        try:
            id=jobs.start(dict(instance([[0]*4,[1]*4],1,1),operation='enumerate',timeout_seconds=1))
            self.wait(jobs,id);jobs.jobs[id]['phase_started']-=10
            self.assertEqual(jobs.get(id)['status'],'paused')
            result=jobs.get(id,cancel=True)
            self.assertEqual(result['count'],'1');self.assertFalse(result['exact']);self.assertEqual(result['status'],'cancelled')
            self.assertIsNotNone(jobs.jobs[id]['process'].poll())
        finally:jobs.close()

    def test_timeout_keeps_lower_bound(self):
        jobs=Jobs()
        try:
            data=instance([list(t) for t in itertools.product(range(2),repeat=4)],4,4)
            id=jobs.start(dict(data,operation='enumerate',enumeration_mode='count',timeout_seconds=1))
            for _ in range(100):
                value=jobs.get(id)
                if int(value.get('count','0'))>0:break
                time.sleep(.005)
            jobs.jobs[id]['phase_started']-=2
            result=jobs.get(id)
            self.assertEqual(result['status'],'timeout');self.assertGreaterEqual(int(result['count']),1);self.assertFalse(result['exact'])
        finally:jobs.close()


if __name__=='__main__':unittest.main()
