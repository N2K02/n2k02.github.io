#!/usr/bin/env python3
"""Inventory and optionally remove old inactive GitHub Pages deployment records."""
import concurrent.futures
import json
import os
import time
import urllib.error
import urllib.request

API = 'https://api.github.com'
OWNER, REPO = 'N2K02', 'n2k02.github.io'
KEEP = 10

def request(path, token, method='GET'):
    headers = {'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer '+token,
               'User-Agent': 'n2k02-deployment-cleanup', 'X-GitHub-Api-Version': '2022-11-28'}
    for attempt in range(4):
        try:
            req = urllib.request.Request(API+path, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=30) as response:
                data = response.read()
                return json.loads(data) if data else None
        except urllib.error.HTTPError as e:
            if e.code not in (429,500,502,503,504) or attempt == 3:
                raise
            time.sleep(min(2 ** attempt, 8))

def plan(deployments, get_state, keep=KEEP):
    pages = [d for d in deployments if d.get('environment') == 'github-pages']
    pages.sort(key=lambda d: (d.get('created_at',''), d.get('id',0)), reverse=True)
    recent = pages[:keep]
    others = pages[keep:]
    # Any missing/unknown/non-inactive status is conservatively preserved.
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        states = list(pool.map(get_state, others))
    candidates = [d for d,state in zip(others,states) if state == 'inactive']
    protected = [d for d,state in zip(others,states) if state != 'inactive']
    return pages, recent, candidates, protected

def main():
    mode = os.environ.get('CLEANUP_MODE', 'dry-run')
    if mode not in ('dry-run','delete'): raise SystemExit('Unknown mode')
    if mode == 'delete' and os.environ.get('DELETE_CONFIRMATION') != 'DELETE':
        raise SystemExit('Delete mode requires DELETE confirmation')
    token = os.environ.get('GH_TOKEN')
    if not token: raise SystemExit('Missing GitHub token')
    base = f'/repos/{OWNER}/{REPO}'
    deployments=[]
    for page in range(1,1000):
        batch = request(f'{base}/deployments?environment=github-pages&per_page=100&page={page}',token)
        if not isinstance(batch,list): raise SystemExit('Invalid deployments response')
        deployments.extend(batch)
        if len(batch)<100: break
    else: raise SystemExit('Too many pages; refusing partial cleanup')
    def status(d):
        data = request(f"{base}/deployments/{d['id']}/statuses?per_page=1",token)
        return data[0].get('state') if data else None
    pages,recent,candidates,protected = plan(deployments,status)
    print(f'Pages deployments: {len(pages)}; retain recent: {len(recent)}; protected: {len(protected)}; inactive candidates: {len(candidates)}; mode: {mode}')
    print('Most recent retained: '+', '.join(str(d['id']) for d in recent))
    if candidates:
        print('Candidate date range:',candidates[-1].get('created_at'), 'to',candidates[0].get('created_at'))
    deleted=0
    if mode == 'delete':
        for d in candidates:
            # Recheck immediately before deletion; never mark an active deployment inactive.
            if status(d) != 'inactive':
                print('Preserved changed status:', d['id']);continue
            request(f"{base}/deployments/{d['id']}",token,'DELETE')
            deleted += 1
            if deleted % 100 == 0: print('Deleted',deleted,'inactive deployment records',flush=True)
    print('Deleted:',deleted)
    summary=os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary,'a',encoding='utf-8') as f:
            f.write(f'## GitHub Pages deployment cleanup\n\nMode: {mode}  \nTotal: {len(pages)}  \nRecent protected: {len(recent)}  \nOther protected: {len(protected)}  \nInactive candidates: {len(candidates)}  \nDeleted: {deleted}\n')
if __name__ == '__main__': main()
