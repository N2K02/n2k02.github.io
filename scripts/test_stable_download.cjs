'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/js/stable-download.js', 'utf8');

async function check(response) {
  const elements = Object.fromEntries(['version', 'details', 'download', 'notes'].map(id => [id, {
    textContent: '', href: '', removeAttribute() {},
  }]));
  let requested;
  const context = {
    document: {currentScript: {dataset: {repo: 'N2K02/BCam'}}, getElementById: id => elements[id]},
    fetch: async url => { requested = url; return response; },
  };
  vm.runInNewContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return {elements, requested};
}
(async () => {
  const asset = {name: 'BCam-5.9.apk', size: 1200000, browser_download_url: 'https://github.com/N2K02/BCam/releases/download/v5.9/BCam-5.9.apk'};
  const valid = await check({ok:true, json:async () => ({tag_name:'v5.9', draft:false, prerelease:false, assets:[asset]})});
  assert.equal(valid.requested, 'https://api.github.com/repos/N2K02/BCam/releases/latest');
  assert.equal(valid.elements.download.href, asset.browser_download_url);
  for (const release of [
    {tag_name:'v6.0', prerelease:true, assets:[asset]},
    {tag_name:'v6.0', draft:true, assets:[asset]},
    {tag_name:'v6.0', assets:[{...asset, browser_download_url:'https://example.com/BCam.apk'}]},
    {tag_name:'v6.0', assets:[]},
  ]) {
    const result = await check({ok:true, json:async () => release});
    assert.equal(result.elements.download.href, 'https://github.com/N2K02/BCam/releases/latest');
    assert.equal(result.elements.download.textContent, 'View latest stable release');
  }
  const offline = await check({ok:false});
  assert.equal(offline.elements.download.href, 'https://github.com/N2K02/BCam/releases/latest');
  console.log('Stable download behavior passed: stable APK, prerelease/draft rejection, invalid assets, and offline fallback.');
})().catch(error => { console.error(error); process.exitCode = 1; });

(async () => {
  const resolver = fs.readFileSync('assets/js/architecture-downloads.js', 'utf8');
  const ids = ['download-adb', 'download-shizuku', 'download-status'];
  const stable = {tag: 'adb-v0.9', apkName: 'SEQ-ADB-0.9.apk',
    apkUrl: 'https://github.com/N2K02/SEQ/releases/download/adb-v0.9/SEQ-ADB-0.9.apk'};
  const experimental = {tag: 'experimental-shizuku-pr-6-run-328', apkName: 'SEQ-SHIZUKU-0.8-experimental.10.apk',
    apkUrl: 'https://github.com/N2K02/SEQ/releases/download/experimental-shizuku-pr-6-run-328/SEQ-SHIZUKU-0.8-experimental.10.apk'};
  async function checkCatalog(response, landing = false) {
    const downloadIds = landing ? [...ids, 'download-experimental-adb', 'download-experimental-shizuku'] : ids;
    const catalogPath = landing ? '/vrec/download/apks.json' : 'apks.json';
    const elements = Object.fromEntries(downloadIds.map(id => [id, {
      href: '', textContent: '', attributes: {'aria-disabled': 'true'},
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) {
        delete this.attributes[name];
        if (name === 'href') this.href = '';
      },
    }]));
    vm.runInNewContext(resolver, {
      document: {currentScript: {dataset: {repo: 'N2K02/SEQ', ...(landing ? {catalog: catalogPath} : {})}}, getElementById: id => elements[id]},
      fetch: async url => {
        assert.equal(url, catalogPath);
        return response;
      },
    });
    await new Promise(resolve => setImmediate(resolve));
    return elements;
  }
  const shizukuStable = {tag: 'shizuku-v1.0', apkName: 'SEQ-SHIZUKU-1.0.apk',
    apkUrl: 'https://github.com/N2K02/SEQ/releases/download/shizuku-v1.0/SEQ-SHIZUKU-1.0.apk'};
  const valid = await checkCatalog({ok:true, json:async () => ({
    stable: {adb: stable, shizuku: shizukuStable},
    experimental: {shizuku: experimental},
  })});
  for (const [id, asset, label] of [
    ['download-adb', stable, 'ADB'],
    ['download-shizuku', shizukuStable, 'Shizuku'],
  ]) {
    assert.equal(valid[id].href, asset.apkUrl);
    assert.equal(valid[id].textContent, 'Download ' + label);
    assert.equal(valid[id].attributes['aria-disabled'], undefined);
  }
  for (const stableSelection of [{adb: stable}, {adb: stable, shizuku: experimental}]) {
    const stableOnly = await checkCatalog({ok:true, json:async () => ({
      stable: stableSelection,
      experimental: {shizuku: experimental},
    })});
    assert.equal(stableOnly['download-adb'].href, stable.apkUrl);
    assert.equal(stableOnly['download-shizuku'].href, '');
    assert.equal(stableOnly['download-shizuku'].attributes['aria-disabled'], 'true');
  }
  const bad = await checkCatalog({ok:true, json:async () => ({
    stable: {adb: {...stable, apkUrl: stable.apkUrl + '.apk'}},
  })});
  assert.equal(bad['download-adb'].href, '');
  assert.equal(bad['download-adb'].attributes['aria-disabled'], 'true');
  const landing = await checkCatalog({ok:true, json:async () => ({
    stable: {adb: stable},
    experimental: {adb: experimental, shizuku: experimental},
  })}, true);
  assert.equal(landing['download-adb'].href, stable.apkUrl);
  assert.equal(landing['download-experimental-shizuku'].href, experimental.apkUrl);
  assert.equal(landing['download-experimental-adb'].attributes['aria-disabled'], 'true');
  const homepage = fs.readFileSync('vrec/index.html', 'utf8');
  assert.match(homepage, /data-catalog="\/vrec\/download\/apks\.json"/);
  for (const id of [...ids, 'download-experimental-adb', 'download-experimental-shizuku']) {
    assert.ok(homepage.includes('id="' + id + '"'), id + ' missing on VREC home');
  }
  const offline = await checkCatalog({ok:false});
  assert.equal(offline['download-adb'].href, '');
  assert.match(offline['download-status'].textContent, /could not be loaded/);
  console.log('Architecture downloads passed: stable choices, invalid URLs, and offline behavior.');
})().catch(error => { console.error(error); process.exitCode = 1; });
