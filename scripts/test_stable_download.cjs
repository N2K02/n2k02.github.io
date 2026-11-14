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
