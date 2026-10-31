# Checks every drowned variant fits its hull: outfit, weapon and engine
# capacity, gun ports and turret mounts, and (since v0.3.4, for the cutlass
# variants) that the outfits in its cargo fit its cargo space, and (since
# v0.3.5) that every ammunition storage ("<ammo> capacity", e.g. "glass lamprey
# capacity", "piercer capacity") holds what is loaded.
#	python3 cap.py [name filter] [-v]
import sys; sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from es import *
outfits,ships,fleets=load()
AMMO_SKIP={'energy capacity','fuel capacity','heat capacity','weapon capacity','engine capacity','cargo space'}
bad=0; n_checked=0
args=[a for a in sys.argv[1:] if a!='-v']; verbose='-v' in sys.argv[1:]
pat=args[0] if args else ''
def cargo_mass(name):
    m=0
    for c in ships[name]['node']['c']:
        if c['t'][0]=='cargo':
            for g in c['c']:
                if g['t'][0]=='outfits':
                    for o in g['c']:
                        m+=outfits[o['t'][0]].get('mass',0)*(int(o['t'][1]) if len(o['t'])>1 else 1)
                elif g['t'][0]=='commodities':
                    for o in g['c']: m+=int(o['t'][1])
    return m
for n in sorted(ships):
    if not n.startswith('Drowned') or pat not in n: continue
    r,_=slack(outfits,ships,n)
    attrs,_=ship_info(ships,n)
    r['cargo space']=attrs.get('cargo space',0)-cargo_mass(n)
    _,outs=ship_info(ships,n)
    for o,k in outs.items():
        for a,v in outfits[o].items():
            if a.endswith(' capacity') and a not in AMMO_SKIP and isinstance(v,float):
                r[a]=r.get(a,attrs.get(a,0))+v*k
    n_checked+=1
    neg=[k for k in r if r[k]<0]
    if neg: bad+=1
    if verbose or neg: print(('OVER ' if neg else '     ')+n, {k:round(v,1) for k,v in r.items()})
print('checked:',n_checked,' over capacity:',bad)
