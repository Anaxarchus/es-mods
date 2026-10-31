import os
# The game's data folder (an Endless Sky checkout's data/) and the plugin's data/.
ES_DATA = os.environ.get("ES_DATA", os.path.expanduser("~/dev/GitHub/endless-sky/data"))
PLUGIN_DATA = os.environ.get("PLUGIN_DATA", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "data"))
import os
def tok(line):
    s=line.strip(); out=[]; i=0
    while i<len(s):
        c=s[i]
        if c in ' \t': i+=1; continue
        if c=='#': break
        if c in '"`':
            j=s.index(c,i+1); out.append(s[i+1:j]); i=j+1
        else:
            j=i
            while j<len(s) and s[j] not in ' \t': j+=1
            out.append(s[i:j]); i=j
    return out
def parse(paths):
    nodes=[]
    for p in paths:
        stack=[]
        for raw in open(p,encoding='utf8'):
            if not raw.strip() or raw.strip().startswith('#'): continue
            ind=len(raw)-len(raw.lstrip('\t')); t=tok(raw)
            if not t: continue
            n={'t':t,'c':[],'f':p}
            while stack and stack[-1][0]>=ind: stack.pop()
            if stack: stack[-1][1]['c'].append(n)
            else: nodes.append(n)
            stack.append((ind,n))
    return nodes
def files(d):
    for r,_,fs in os.walk(d):
        for f in fs:
            if f.endswith('.txt'): yield os.path.join(r,f)
def load():
    nodes=parse(list(files(ES_DATA))+list(files(PLUGIN_DATA)))
    outfits={}; ships={}; fleets={}
    for n in nodes:
        t=n['t']
        if t[0]=='outfit' and len(t)>1:
            a={}
            for c in n['c']:
                if len(c['t'])>=2:
                    try: a[c['t'][0]]=float(c['t'][1])
                    except: a[c['t'][0]]=c['t'][1]
                elif len(c['t'])==1: a[c['t'][0]]=1
                if c['t'][0]=='weapon':
                    w={}
                    for g in c['c']:
                        if len(g['t'])>=2:
                            try: w[g['t'][0]]=float(g['t'][1])
                            except: w[g['t'][0]]=g['t'][1]
                    a['weapon']=w
            outfits[t[1]]=a
        elif t[0]=='ship' and len(t)>1:
            ships[t[-1]]={'base':t[1],'node':n}
        elif t[0]=='fleet' and len(t)>1:
            fleets[t[1]]=n
    return outfits,ships,fleets
def ship_info(ships,name):
    s=ships[name]; base=ships[s['base']]['node']
    attrs={}; guns=turrets=0
    for c in base['c']:
        if c['t'][0]=='attributes':
            for a in c['c']:
                if len(a['t'])>=2:
                    try: attrs[a['t'][0]]=float(a['t'][1])
                    except: pass
        if c['t'][0]=='gun': guns+=1
        if c['t'][0]=='turret': turrets+=1
    outs={}
    # A variant without an "outfits" node inherits its hull's (Ship::FinishLoading).
    src=s['node'] if any(c['t'][0]=='outfits' for c in s['node']['c']) else base
    for c in src['c']:
        if c['t'][0]=='outfits':
            for o in c['c']:
                outs[o['t'][0]]=outs.get(o['t'][0],0)+(int(o['t'][1]) if len(o['t'])>1 else 1)
    if not outs and name==s['base']:
        pass
    attrs['gun ports']=guns; attrs['turret mounts']=turrets
    return attrs,outs
KEYS=['outfit space','weapon capacity','engine capacity','gun ports','turret mounts']
def slack(outfits,ships,name):
    attrs,outs=ship_info(ships,name)
    r={k:attrs.get(k,0) for k in KEYS}
    for o,n in outs.items():
        a=outfits[o]
        for k in KEYS: r[k]+=a.get(k,0)*n
    return r,outs

def heat(outfits,ships,name):
    attrs,outs=ship_info(ships,name)
    mass=attrs.get('mass',0); diss=attrs.get('heat dissipation',0)
    gen=0; cool=0; fire=0; egen=0; euse=0
    for o,n in outs.items():
        a=outfits[o]
        mass+=a.get('mass',0)*n; diss+=a.get('heat dissipation',0)*n
        gen+=a.get('heat generation',0)*n; cool+=(a.get('cooling',0)+a.get('active cooling',0))*n
        egen+=a.get('energy generation',0)*n-a.get('energy consumption',0)*n-a.get('cooling energy',0)*n
        w=a.get('weapon')
        if w and isinstance(w,dict) and a.get('gun ports') or (w and a.get('turret mounts')):
            r=w.get('reload',1) or 1
            fire+=w.get('firing heat',0)/r*n; euse+=w.get('firing energy',0)/r*n
    cap=0.1*diss*mass
    return dict(net=gen+fire-cool, cap=cap, mass=mass, egen=egen, efire=euse)
