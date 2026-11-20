(() => {
  'use strict';
  const {repo: repository} = document.currentScript.dataset;
  if (!/^N2K02\/[A-Za-z0-9_-]+$/.test(repository)) return;
  const app = repository.split('/')[1];
  const base = 'https://github.com/' + repository + '/releases/download/';
  function isValid(asset, track) {
    if (!asset || typeof asset.tag !== 'string') return false;
    const stable = new RegExp('^' + track + '-v(\\d+\\.\\d+)$').exec(asset.tag);
    const filename = stable && app + '-' + track.toUpperCase() + '-' + stable[1] + '.apk';
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
      setLink(link, label, isValid(asset, track) ? asset.apkUrl : undefined);
    }
  }

  fetch('apks.json', {cache: 'no-store'})
    .then(response => {
      if (!response.ok) throw Error('APK list unavailable');
      return response.json();
    })
    .then(catalog => {
      show(catalog);
      status.textContent = '';
    }, () => {
      show(null);
      status.textContent = 'The APK list could not be loaded. See all GitHub releases below.';
    });
})();
