import json, urllib.request, urllib.parse, itertools, random, sys, time
M='' + __import__('os').environ.get('OPENALEX_MAILTO','') + ''
def get(u):
    for a in range(4):
        try: return json.load(urllib.request.urlopen(u,timeout=40))
        except urllib.error.HTTPError as e:
            if e.code in (429,503): time.sleep(1.5*(a+1)); continue
            raise
def oa(params):
    params=dict(params); params['mailto']=M
    return get("https://api.openalex.org/works?"+urllib.parse.urlencode(params))
def eu(tool,params):
    params=dict(params); params.update({'tool':'papertrail','email':M,'retmode':'json'})
    time.sleep(0.4); return get(f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/{tool}.fcgi?"+urllib.parse.urlencode(params))
short=lambda x:x.split('/')[-1]
def batch(ids,select,key='openalex_id'):
    out={}
    for i in range(0,len(ids),50):
        r=oa({'filter':f'{key}:'+'|'.join(ids[i:i+50]),'per-page':50,'select':select})
        for w in r['results']: out[short(w['id'])]=w
    return out
REVIEW,TRIAL=sys.argv[1],int(sys.argv[2])
rv=batch([REVIEW],'id,display_name,publication_date,referenced_works')[REVIEW]
refs=[short(x) for x in rv['referenced_works']]; cutoff=rv['publication_date']; title=rv['display_name']
seeds=random.Random(TRIAL).sample(refs,5); truth=set(refs)-set(seeds)
sd=batch(seeds,'id,ids,referenced_works,related_works,publication_date')
routes={}
routes['R1 refs of seeds']={short(r) for s in seeds for r in sd[s].get('referenced_works',[])}
r2=set()
for a,b in itertools.combinations(seeds,2):
    for page in (1,2):
        r=oa({'filter':f'cites:{a},cites:{b},to_publication_date:{cutoff}','per-page':200,'page':page,'sort':'cited_by_count:desc','select':'id'})
        r2|={short(w['id']) for w in r['results']}
        if page*200>=r['meta']['count']: break
routes['R2 cite >=2 seeds']=r2
routes['R3a OpenAlex related_works']={short(r) for s in seeds for r in sd[s].get('related_works',[])}
pm=[short(sd[s]['ids'].get('pmid','')) for s in seeds if sd[s].get('ids',{}).get('pmid')]
sim=[]
for p in pm:
    j=eu('elink',{'dbfrom':'pubmed','db':'pubmed','id':p,'linkname':'pubmed_pubmed','cmd':'neighbor_score'})
    for ls in j['linksets']:
        for ld in ls.get('linksetdbs',[]):
            if ld['linkname']=='pubmed_pubmed': sim+= [l['id'] if isinstance(l,dict) else l for l in ld['links'][:60]]
simoa=batch(list(dict.fromkeys(sim)),'id','pmid')
routes['R3b PubMed similar (60/seed)']=set(simoa)
es=eu('esearch',{'db':'pubmed','term':title,'retmax':100,'sort':'relevance','maxdate':cutoff.replace('-','/'),'datetype':'pdat'})
kw=es['esearchresult']['idlist']
kwoa=batch(kw,'id','pmid')
order={short(w):i for i,w in enumerate(kw)}
routes['Baseline PubMed keyword top100']=set(kwoa)
r=oa({'search':title,'filter':f'to_publication_date:{cutoff}','per-page':100,'select':'id'})
routes['Baseline OpenAlex search top100']={short(w['id']) for w in r['results']}
excl=set(seeds)|{REVIEW}
print(f'REVIEW {title[:60]} | trial {TRIAL} | truth {len(truth)} | PubMed hits for title: {es["esearchresult"]["count"]}')
union=set()
for k,v in routes.items():
    v-=excl; union|=v if not k.startswith('Baseline') else set()
    print(f'  {k:34s} size {len(v):4d}  hits {len(v&truth):3d}  ({len(v&truth)/len(truth):.0%} recall, {len(v&truth)/max(1,len(v)):.0%} precision)')
print(f'  {"UNION of R1-R3":34s} size {len(union):4d}  hits {len(union&truth):3d}  ({len(union&truth)/len(truth):.0%})')
json.dump({k:sorted(v) for k,v in routes.items()}|{'truth':sorted(truth),'seeds':seeds},open(f'reach_{REVIEW}_{TRIAL}.json','w'))
