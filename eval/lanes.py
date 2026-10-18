import json, urllib.request, urllib.parse, time, os
M=os.environ.get('OPENALEX_MAILTO','')
def get(u):
    for a in range(4):
        try: return json.load(urllib.request.urlopen(u,timeout=60))
        except urllib.error.HTTPError as e:
            if e.code in (429,503): time.sleep(1.5*(a+1)); continue
            raise
short=lambda x:x.split('/')[-1] if x else x
def oa_batch(ids,key='openalex_id'):
    out={}
    sel='id,doi,ids,display_name,publication_year,publication_date,cited_by_count,type,primary_location,authorships,is_retracted,referenced_works,open_access'
    for i in range(0,len(ids),50):
        p={'filter':f'{key}:'+'|'.join(ids[i:i+50]),'per-page':50,'select':sel}
        if M: p['mailto']=M
        r=get("https://api.openalex.org/works?"+urllib.parse.urlencode(p))
        for w in r['results']: out[short(w['id'])]=w
    return out
def eu(tool,params):
    params=dict(params); params.update({'tool':'papertrail','retmode':'json'})
    time.sleep(0.4); return get(f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/{tool}.fcgi?"+urllib.parse.urlencode(params))
SEEDS=['W2332292689','W2899145148','W3184584468','W4229030906','W3165815938']
sd=oa_batch(SEEDS)
seedrefs={s:{short(x) for x in sd[s]['referenced_works']} for s in SEEDS}
# R1
r1={}
for s in SEEDS:
    for x in seedrefs[s]: r1.setdefault(x,set()).add(s)
# R2 from saved file
r2=json.load(open('multi_seed_citers.json'))
r2ids={r['id'] for r in r2}
# R3 PubMed similar
sim_rank={}
for s in SEEDS:
    pm=short(sd[s]['ids'].get('pmid'))
    j=eu('elink',{'dbfrom':'pubmed','db':'pubmed','id':pm,'linkname':'pubmed_pubmed','cmd':'neighbor_score'})
    for ls in j['linksets']:
        for ld in ls.get('linksetdbs',[]):
            if ld['linkname']=='pubmed_pubmed':
                for k,l in enumerate(ld['links'][:60]):
                    pid=l['id'] if isinstance(l,dict) else l
                    sim_rank[pid]=min(sim_rank.get(pid,999),k+1)
r3=oa_batch(list(sim_rank),'pmid')
r3_pm={w_id:short(w['ids'].get('pmid')) for w_id,w in r3.items()}
need=[i for i in set(r1)|set(r3) if i not in SEEDS]
meta=oa_batch([i for i in need if i not in r3])
meta.update(r3)
pool={}
for i in set(r1)|r2ids|set(r3):
    if i in SEEDS: continue
    w=meta.get(i)
    if w is None:
        rr=next((r for r in r2 if r['id']==i),None)
        if rr is None: continue
        refs=None; title=rr['title']; year=rr['year']; date=str(rr['year']); cc=rr['cites']; typ=rr['type']; venue=rr['venue']; au=rr['author']; doi=rr['doi']; retr=False; oa=None
        out={'S'+s[1] for s in rr['seeds']}
        outs={SEEDS[int(x[1])-1] for x in rr['seeds']}
    else:
        refs={short(x) for x in w.get('referenced_works',[])}
        title=w['display_name']; year=w['publication_year']; date=w.get('publication_date') or str(year); cc=w['cited_by_count']; typ=w['type']
        venue=((w.get('primary_location') or {}).get('source') or {}).get('display_name') or ''
        au=w['authorships'][0]['author']['display_name'] if w.get('authorships') else ''
        doi=w.get('doi'); retr=bool(w.get('is_retracted')); oa=(w.get('open_access') or {}).get('is_oa')
        outs={s for s in SEEDS if s in refs}
    ins=r1.get(i,set())
    links=outs|ins
    routes=[]
    if i in r1: routes.append('R1')
    if i in r2ids: routes.append('R2')
    if i in r3: routes.append('R3')
    pmr=sim_rank.get(r3_pm.get(i),None) if i in r3 else None
    pool[i]=dict(id=i,t=title,y=year,dt=date,c=cc,k=typ,v=venue,a=au,d=(doi or '').replace('https://doi.org/',''),
                 out=sorted(SEEDS.index(s)+1 for s in outs),inn=sorted(SEEDS.index(s)+1 for s in ins),
                 n=len(links),routes=routes,pmr=pmr,retr=retr,oa=oa)
FRESH='2025-04-18'
def lane(p):
    if p['retr']: return 'Retracted'
    if p['n']>=2: return 'Core'
    if (p['dt'] or '')>=FRESH: return 'Fresh'
    if p['n']==1: return 'Linked'
    return 'Bridges'
for p in pool.values(): p['lane']=lane(p)
from collections import Counter
print('routes sizes: R1',len([1 for p in pool.values() if 'R1' in p['routes']]),'R2',len([1 for p in pool.values() if 'R2' in p['routes']]),'R3',len([1 for p in pool.values() if 'R3' in p['routes']]))
print('union',len(pool),'lanes',Counter(p['lane'] for p in pool.values()))
print('overlaps R1&R3',len([1 for p in pool.values() if 'R1' in p['routes'] and 'R3' in p['routes']]),'R2&R3',len([1 for p in pool.values() if 'R2' in p['routes'] and 'R3' in p['routes']]))
def order(p):
    if p['lane']=='Bridges': return (0,-(p['pmr'] or 999))
    return (p['n'],p['c'])
top={}
for L in ['Core','Fresh','Linked','Bridges','Retracted']:
    items=sorted([p for p in pool.values() if p['lane']==L],key=order,reverse=True)
    top[L]=items[:10]
    print('\n==',L,len(items))
    for p in items[:6]: print(' ',p['n'],p['out'],p['inn'],p['routes'],p['y'],p['c'],p['pmr'],'|',p['t'][:90])
json.dump({'counts':Counter(p['lane'] for p in pool.values()),'routes':{'R1':len([1 for p in pool.values() if 'R1' in p['routes']]),'R2':len([1 for p in pool.values() if 'R2' in p['routes']]),'R3':len([1 for p in pool.values() if 'R3' in p['routes']])},'union':len(pool),'top':top},open('lanes.json','w'),ensure_ascii=False)
