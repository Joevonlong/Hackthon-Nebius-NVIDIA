import json, urllib.request, urllib.parse, itertools, random, sys, time, math
M='' + __import__('os').environ.get('OPENALEX_MAILTO','') + ''
def oa(params):
    params=dict(params); params['mailto']=M
    u="https://api.openalex.org/works?"+urllib.parse.urlencode(params)
    for a in range(3):
        try: return json.load(urllib.request.urlopen(u,timeout=40))
        except urllib.error.HTTPError as e:
            if e.code in (429,503): time.sleep(2); continue
            raise
def short(x): return x.split('/')[-1]
def batch(ids, select):
    out={}
    for i in range(0,len(ids),50):
        r=oa({'filter':'openalex_id:'+'|'.join(ids[i:i+50]),'per-page':50,'select':select})
        for w in r['results']: out[short(w['id'])]=w
    return out
REVIEW=sys.argv[1]
rv=batch([REVIEW],'id,display_name,publication_year,publication_date,referenced_works')[REVIEW]
refs=[short(x) for x in rv['referenced_works']]
print('REVIEW:',rv['display_name'],rv['publication_year'],'refs',len(refs))
cutoff=rv['publication_date']
meta=batch(refs,'id,publication_year,cited_by_count')
results=[]
for trial in range(3):
    rnd=random.Random(trial)
    seeds=rnd.sample(refs,5)
    truth=set(refs)-set(seeds)
    sd=batch(seeds,'id,referenced_works,cited_by_count')
    pool={}  # id -> {'cites':set(seed), 'citedby':set(seed), 'cc':int, 'refs':set}
    def add(w):
        i=short(w['id'])
        if i==REVIEW or i in seeds: return None
        p=pool.setdefault(i,{'cites':set(),'citedby':set(),'cc':w.get('cited_by_count',0),'refs':set(short(x) for x in w.get('referenced_works',[]) or [])})
        return p
    # R1 backward: refs of seeds
    for s in seeds:
        for r_ in sd[s].get('referenced_works',[]):
            pool.setdefault(short(r_),{'cites':set(),'citedby':set(),'cc':None,'refs':set()})['citedby'].add(s)
    pool.pop(REVIEW,None)
    for s in seeds: pool.pop(s,None)
    # R2 forward: works citing >=2 seeds, published before review
    nreq=0
    for a,b in itertools.combinations(seeds,2):
        for page in (1,2):
            r=oa({'filter':f'cites:{a},cites:{b},to_publication_date:{cutoff}','per-page':200,'page':page,'sort':'cited_by_count:desc','select':'id,cited_by_count,referenced_works'}); nreq+=1
            for w in r['results']:
                p=add(w)
                if p is None: continue
                for s in seeds:
                    if 'https://openalex.org/'+s in w.get('referenced_works',[]): p['cites'].add(s)
            if page*200>=r['meta']['count']: break
    # cited_by counts for backward-only items
    need=[i for i,p in pool.items() if p['cc'] is None]
    got=batch(need,'id,cited_by_count,publication_year')
    for i in need:
        w=got.get(i); pool[i]['cc']=w['cited_by_count'] if w else 0
        pool[i]['year']=w['publication_year'] if w else None
    # idf weights for seeds (Adamic-Adar style)
    idf={s: 1/math.log(2+sd[s]['cited_by_count']) for s in seeds}
    def conn(p): return len(p['cites']|p['citedby'])
    def graph_w(p): return sum(idf[s] for s in p['cites']|p['citedby'])
    rankings={
      'citations only': sorted(pool,key=lambda i:-(pool[i]['cc'] or 0)),
      'seed links (count)': sorted(pool,key=lambda i:(-conn(pool[i]),-(pool[i]['cc'] or 0))),
      'seed links (idf-weighted)': sorted(pool,key=lambda i:(-graph_w(pool[i]),-(pool[i]['cc'] or 0))),
    }
    res={'trial':trial,'pool':len(pool),'truth':len(truth),'reachable':len(truth & set(pool)),'req':nreq}
    for name,rk in rankings.items():
        for k in (20,50,100):
            res[f'{name}@{k}']=len(set(rk[:k])&truth)
    results.append(res)
    print(json.dumps(res))
json.dump(results,open(f'holdout_{REVIEW}.json','w'))
