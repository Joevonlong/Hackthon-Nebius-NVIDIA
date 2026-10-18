import json, urllib.request, urllib.parse, sys, time, math, re
from collections import Counter
M='' + __import__('os').environ.get('OPENALEX_MAILTO','') + ''
def get(u):
    for a in range(4):
        try: return json.load(urllib.request.urlopen(u,timeout=60))
        except urllib.error.HTTPError as e:
            if e.code in (429,503): time.sleep(1.5*(a+1)); continue
            raise
short=lambda x:x.split('/')[-1]
def batch(ids,select):
    out={}
    for i in range(0,len(ids),50):
        r=get("https://api.openalex.org/works?"+urllib.parse.urlencode({'filter':'openalex_id:'+'|'.join(ids[i:i+50]),'per-page':50,'select':select,'mailto':M}))
        for w in r['results']: out[short(w['id'])]=w
    return out
REVIEW,TRIAL=sys.argv[1],sys.argv[2]
d=json.load(open(f'reach_{REVIEW}_{TRIAL}.json'))
seeds=d['seeds']; truth=set(d['truth'])
pool=set()
for k,v in d.items():
    if k.startswith('R1') or k.startswith('R2') or k.startswith('R3b'): pool|=set(v)
pool-=set(seeds)|{REVIEW}
pool=sorted(pool)
title=batch([REVIEW],'id,display_name')[REVIEW]['display_name']
sd=batch(seeds,'id,display_name,referenced_works')
W=batch(pool,'id,display_name,cited_by_count,referenced_works')
seedset=set(seeds)
seedrefs={s:{short(x) for x in sd[s].get('referenced_works',[])} for s in seeds}
STOP=set('the and for with from into that this are was were their its our using use via between among cancer human cell cells study analysis role new based'.split())
tok=lambda t:[w for w in re.findall(r'[a-z0-9+\-]{3,}',(t or '').lower()) if w not in STOP]
docs={i:tok(W[i]['display_name']) for i in W}
qd={('S',s):tok(sd[s]['display_name']) for s in seeds}; qd[('Q',0)]=tok(title)
df=Counter(w for t in list(docs.values())+list(qd.values()) for w in set(t)); N=len(docs)+len(qd)
def vec(t):
    c=Counter(t); v={w:(1+math.log(n))*math.log(1+N/df[w]) for w,n in c.items()}; nr=math.sqrt(sum(x*x for x in v.values())) or 1
    return {w:x/nr for w,x in v.items()}
cos=lambda a,b:sum(a[w]*b.get(w,0) for w in a)
qv={k:vec(t) for k,t in qd.items()}
rows=[]
for i,w in W.items():
    v=vec(docs[i]); refs={short(x) for x in w.get('referenced_works',[])}
    links=sum(1 for s in seeds if i in seedrefs[s])+len(refs&seedset)
    text=0.5*max(cos(v,qv[('S',s)]) for s in seeds)+0.5*cos(v,qv[('Q',0)])
    rows.append(dict(id=i,links=links,text=text,cc=w.get('cited_by_count',0)))
def pct(key):
    srt=sorted(rows,key=lambda r:r[key]); n=len(srt)
    for k,r in enumerate(srt): r['p_'+key]=k/(n-1)
for key in ('links','text','cc'): pct(key)
def rank(fn): return [r['id'] for r in sorted(rows,key=fn,reverse=True)]
R={
 'citations only':rank(lambda r:r['cc']),
 'graph only (seed links)':rank(lambda r:(r['links'],r['cc'])),
 'text only (title TF-IDF)':rank(lambda r:r['text']),
}
rg={x:k for k,x in enumerate(R['graph only (seed links)'])}; rt={x:k for k,x in enumerate(R['text only (title TF-IDF)'])}
R['tiers: seed links, then text']=rank(lambda r:(r['links'],r['text']))
R['RRF(graph, text)']=rank(lambda r:1/(60+rg[r['id']])+1/(60+rt[r['id']]))
R['0.5 graph + 0.4 text + 0.1 cites (pct)']=rank(lambda r:.5*r['p_links']+.4*r['p_text']+.1*r['p_cc'])
print(f'{title[:60]} | trial {TRIAL} | pool {len(rows)} | relevant in pool {len(set(W)&truth)} | base rate {len(set(W)&truth)/len(rows):.1%}')
for k,v in R.items(): print(f'  {k:42s} P@20 {len(set(v[:20])&truth)/20:4.0%}  hits@20 {len(set(v[:20])&truth):2d}  @50 {len(set(v[:50])&truth):2d}  @100 {len(set(v[:100])&truth):2d}')
