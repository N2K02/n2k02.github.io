(() => {
  'use strict';
  const {repo: repository, catalog: catalogPath = 'apks.json'} = document.currentScript.dataset;
  if (!/^N2K02\/[A-Za-z0-9_-]+$/.test(repository)) return;
  const app = repository.split('/')[1];
  const base = 'https://github.com/' + repository + '/releases/download/';
  function isValid(asset, track, channel) {
    if (!asset || typeof asset.tag !== 'string') return false;
    const prefix = app + '-' + track.toUpperCase() + '-';
    let filename;
    if (channel === 'stable') {
      const version = new RegExp('^' + track + '-v(\\d+\\.\\d+)$').exec(asset.tag);
      if (!version) return false;
      filename = prefix + version[1] + '.apk';
    } else {
      if (!new RegExp('^experimental-' + track + '-pr-\\d+-run-\\d+$').test(asset.tag)) return false;
      if (typeof asset.apkName !== 'string' || !asset.apkName.startsWith(prefix) ||
          !/^\d+\.\d+-experimental\.\d+\.apk$/.test(asset.apkName.slice(prefix.length))) return false;
      filename = asset.apkName;
    }
    return filename && asset.apkName === filename && asset.apkUrl === base + asset.tag + '/' + filename;
  }

  const status = document.getElementById('download-status');

  function setLink(link, label, url) {
    link.textContent = url ? 'Download ' + label : label + ' unavailable';
    if (url) {
      link.href = url;
      link.removeAttribute('aria-disabled');
    } else {
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
    }
  }

  function show(catalog) {
    for (const [track, label] of [['adb', 'ADB'], ['shizuku', 'Shizuku']]) {
      const link = document.getElementById('download-' + track);
      const asset = catalog?.stable?.[track];
      setLink(link, label, isValid(asset, track, 'stable') ? asset.apkUrl : undefined);
      const experimentalLink = document.getElementById('download-experimental-' + track);
      if (experimentalLink) {
        const experimental = catalog?.experimental?.[track];
        setLink(experimentalLink, label,
          isValid(experimental, track, 'experimental') ? experimental.apkUrl : undefined);
      }
    }
  }

  fetch(catalogPath, {cache: 'no-store'})
    .then(response => {
      if (!response.ok) throw Error('APK list unavailable');
      return response.json();
    })
    .then(catalog => {
      show(catalog);
      status.textContent = '';
    }, () => {
      show(null);
      status.textContent = 'The APK list could not be loaded. Use the GitHub release links on this page.';
    });
})();
