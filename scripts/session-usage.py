#!/usr/bin/env python3
"""Token composition across this project's Claude Code sessions (main + subagents).
Run: python3 scripts/session-usage.py   — compare cache_read/call and subagent share week over week."""
import json,glob,os,collections,sys
base=os.path.expanduser('~/.claude/projects/'+os.getcwd().replace('/','-').replace('.','-'))
files=glob.glob(base+'/*.jsonl')
sub=glob.glob(base+'/*/subagents/*.jsonl')
def scan(f):
    seen={}; tools=collections.Counter(); models=collections.Counter(); first_in=None; turns=0
    for l in open(f,errors='ignore'):
        try:d=json.loads(l)
        except: continue
        m=d.get('message') or {}
        if d.get('type')=='assistant' and isinstance(m,dict) and m.get('usage'):
            u=m['usage']; mid=m.get('id') or d.get('uuid')
            seen[mid]=(u.get('input_tokens',0),u.get('cache_creation_input_tokens',0),u.get('cache_read_input_tokens',0),u.get('output_tokens',0),m.get('model'))
            for c in m.get('content',[]) if isinstance(m.get('content'),list) else []:
                if c.get('type')=='tool_use':
                    tools[c['name']]+=1
                    if first_in is None: pass
    t=[0,0,0,0]; 
    for v in seen.values():
        for i in range(4): t[i]+=v[i]
        models[v[4]]+=1
    fi=next(iter(seen.values()))[:3] if seen else None
    return t,tools,models,len(seen),fi
def agg(fs):
    T=[0,0,0,0];TL=collections.Counter();M=collections.Counter();N=0;per=[]
    for f in fs:
        t,tl,m,n,fi=scan(f)
        for i in range(4):T[i]+=t[i]
        TL+=tl;M+=m;N+=n;per.append((sum(t[:3]),f,n,t,fi))
    return T,TL,M,N,per
for name,fs in (('MAIN',files),('SUBAGENT',sub)):
    T,TL,M,N,per=agg(fs)
    print(name,'files',len(fs),'api calls',N)
    print(' fresh_in %.1fM cache_write %.1fM cache_read %.1fM out %.2fM'%tuple(x/1e6 for x in T))
    print(' models',M.most_common(6))
    print(' top tools',TL.most_common(14))
    per.sort(reverse=True)
    if name=='MAIN':
        print(' top sessions:')
        for p in per[:6]: print('  ',os.path.basename(p[1])[:8],'calls',p[2],'ctxtok(sum) %.0fM'%(p[0]/1e6),'out %.0fk'%(p[3][3]/1e3))
        import statistics
        fis=[p[4] for p in per if p[4]]
        print(' first-turn context (cache_create+read+in) median',statistics.median([sum(x) for x in fis]),'min',min(sum(x) for x in fis))
