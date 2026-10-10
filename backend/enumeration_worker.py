"""Incremental native enumeration. A paused callback retains the real DFS stack."""
import json
import os
from pathlib import Path
import sys
import time
from native_solver import enumerate_solutions


def atomic_json(path, value):
    temporary=path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value))
    os.replace(temporary,path)


def main():
    progress, control=map(Path,sys.argv[1:3])
    data=json.load(sys.stdin)
    mode=data.get('enumeration_mode','step')
    generation=0
    count=0
    last_snapshot=None
    metrics={}
    last_emit=0
    started=time.monotonic()
    paused_time=0
    def publish(status,exact=False):
        atomic_json(progress,dict(status=status,solver='optimized',count=str(count),exact=exact,
            mode=mode,generation=generation,assignments=last_snapshot,metrics=metrics,
            elapsed_ms=round((time.monotonic()-started-paused_time)*1000,2)))
    def visitor(snapshot, current_metrics):
        nonlocal count,last_snapshot,metrics,last_emit,mode,paused_time,generation
        count+=1;metrics=current_metrics
        if mode=='step':
            last_snapshot=snapshot();publish('paused')
            paused_at=time.monotonic()
            while True:
                try:
                    command=json.loads(control.read_text())
                    control.unlink()
                except FileNotFoundError:
                    time.sleep(.025);continue
                if command.get('action') not in ('next','count'):
                    continue
                generation=command['generation']
                mode='count' if command['action']=='count' else 'step'
                paused_time+=time.monotonic()-paused_at
                publish('running');last_emit=time.monotonic()
                return True
        if count==1 or time.monotonic()-last_emit>=.15:
            # Snapshot only the first counted solution. Counting doesn't keep a
            # list of solutions, and memory use is independent of their number.
            if last_snapshot is None:last_snapshot=snapshot()
            publish('running');last_emit=time.monotonic()
        return True
    try:
        publish('running')
        result=enumerate_solutions(data,visitor)
        metrics=result['metrics']
        publish('complete',exact=result['complete'])
    except Exception as error:
        atomic_json(progress,dict(status='error',solver='optimized',count=str(count),exact=False,generation=generation,message=str(error)))


if __name__=='__main__':main()
