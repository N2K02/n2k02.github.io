#!/usr/bin/env python3
"""Keep legacy update feeds pointing at signed assets in public app releases."""
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ADB_BRIDGE_APPS = {'McpAdbAndroidLogger', 'SDCleaner', 'SEQ', 'VREC'}
APPS = ('AAYoutube','BCam','ChargeWatt','HFreebuds','LocalAdb','MRadio',
        'McpAdbAndroidLogger','MovieTogether','NetSpeed','PBar','PCL',
        'PixelCast','SDCleaner','SEQ','SpeedTester','VREC')
CODE = re.compile(r'^\s*Version code:\s*(\d+)\s*$', re.I | re.M)
EXPERIMENTAL = re.compile(r'^experimental-pr-\d+-run-(\d+)$', re.I)

def manifest(repo, release, channel, track=None):
    if not isinstance(release, dict) or release.get('draft') or bool(release.get('prerelease')) != (channel == 'experimental'):
        return None
    tag = release.get('tag_name', '')
    if not isinstance(tag, str) or not tag:
        return None
    track = track or ("adb" if repo in ADB_BRIDGE_APPS else None)
    expected_asset = None
    if track:
        if channel == 'experimental':
            if not re.fullmatch(rf'experimental-{track}-pr-\d+-run-\d+', tag):
                return None
            expected_asset = rf'{re.escape(repo)}-{track.upper()}-\d+\.\d+-experimental\.\d+\.apk'
        else:
            version = re.fullmatch(rf'{track}-(?:sdcleaner-)?v(\d+\.\d+)', tag)
            if not version:
                return None
            expected_asset = re.escape(f'{repo}-{track.upper()}-{version[1]}.apk')
    found = CODE.search(release.get('body') or '')
    fallback = EXPERIMENTAL.fullmatch(tag) if channel == 'experimental' else None
    code = int(found.group(1)) if found else (100000 + int(fallback.group(1)) if fallback else 0)
    if not 0 < code <= 2100000000:
        return None
    for asset in release.get('assets', []):
        name, url, digest = (asset.get(k, '') for k in ('name','browser_download_url','digest'))
        expected = f'https://github.com/N2K02/{repo}/releases/download/'
        if not (isinstance(name, str) and name.lower().endswith('.apk') and isinstance(url, str) and url.startswith(expected) and isinstance(digest, str) and re.fullmatch(r'sha256:[0-9a-fA-F]{64}', digest)):
            continue
        if expected_asset and (not re.fullmatch(expected_asset, name) or url != f'{expected}{tag}/{name}'):
            continue
        size = asset.get('size')
        if not isinstance(size, int) or size <= 0:
            continue
        notes = [line.strip()[2:] for line in (release.get('body') or '').splitlines() if line.strip().startswith('- ')][:10]
        return dict(channel=channel, tag=tag, versionName=tag, versionCode=code,
                    apkName=name, apkUrl=url, apkSize=size, sha256=digest[7:].lower(),
                    pageUrl=f'https://github.com/N2K02/{repo}/releases/tag/{tag}', notes=notes)
    return None

def select(repo, releases, channel, track=None):
    candidates = [value for item in releases if (value := manifest(repo, item, channel, track))]
    return max(candidates, key=lambda x: x['versionCode'], default=None)

def update(path, value, adb_bridge=False):
    if value is None:
        return False
    try:
        old = json.loads(path.read_text())
    except FileNotFoundError:
        old = {}
    # Never regress an installed client or replace an equal version with other bytes.
    old_code = old.get('versionCode', 0)
    old_tag = str(old.get('tag', '')).lower()
    old_name = str(old.get('apkName', '')).lower()
    wrong_track = adb_bridge and (
        old_tag.startswith(('shizuku-', 'experimental-shizuku-')) or '-shizuku-' in old_name
    )
    if not wrong_track and isinstance(old_code, int) and old_code >= value['versionCode']:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')
    return True

def api(path, token):
    headers = {'Accept':'application/vnd.github+json', 'User-Agent':'N2K02-legacy-update-bridge',
               'X-GitHub-Api-Version':'2022-11-28'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request('https://api.github.com/' + path, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise

def sync_download_catalog(repo, releases):
    catalog = {}
    for channel in ("stable", "experimental"):
        catalog[channel] = {}
        for track in ("adb", "shizuku"):
            asset = select(repo, releases, channel, track)
            catalog[channel][track] = (
                {key: asset[key] for key in ("tag", "apkName", "apkUrl")} if asset else None
            )
    path = ROOT / repo.lower() / "download" / "apks.json"
    content = json.dumps(catalog, indent=2) + "\n"
    if path.exists() and path.read_text() == content:
        return False
    path.write_text(content)
    return True

def sync(repo, token):
    stable = api(f'repos/N2K02/{repo}/releases/latest', token)
    releases = api(f'repos/N2K02/{repo}/releases?per_page=100', token)
    if releases is not None and not isinstance(releases, list):
        raise ValueError('Unexpected release list')
    base = ROOT / repo.lower() / 'updates'
    changes = []
    adb_bridge = repo in ADB_BRIDGE_APPS
    if adb_bridge:
        # Stable assets may be older than the first page of experimental builds.
        page = releases or []
        for number in range(2, 21):
            if len(page) < 100:
                break
            page = api(f'repos/N2K02/{repo}/releases?per_page=100&page={number}', token)
            if not isinstance(page, list):
                raise ValueError('Unexpected release list page')
            releases.extend(page)
        if len(page) == 100:
            raise ValueError('Could not scan all releases')
        if sync_download_catalog(repo, [stable, *(releases or [])]):
            changes.append('downloads')
    stable_value = select(repo, [stable, *(releases or [])], 'stable') if adb_bridge else manifest(repo, stable, 'stable')
    for channel, value in [('stable', stable_value),
                           ('experimental', select(repo, releases or [], 'experimental'))]:
        if update(base / (channel + '.json'), value, adb_bridge=adb_bridge):
            changes.append(channel)
    return changes

def main():
    failed = []
    for repo in APPS:
        try:
            print(repo, ', '.join(sync(repo, os.environ.get('GH_TOKEN', ''))) or 'unchanged')
        except (OSError, ValueError, json.JSONDecodeError) as error:
            print(f'{repo}: sync failed: {error}', file=sys.stderr)
            failed.append(repo)
    if failed:
        raise SystemExit('Failed repositories: ' + ', '.join(failed))

if __name__ == '__main__':
    main()
