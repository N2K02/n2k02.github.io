(() => {
  'use strict';
  const repository = document.currentScript.dataset.repo;
  if (!/^N2K02\/[A-Za-z0-9_-]+$/.test(repository)) return;
  const app = repository.split('/')[1];
  const base = 'https://github.com/' + repository + '/releases/download/';
  function isValid(asset, track) {
    if (!asset || typeof asset.tag !== 'string') return false;
    const stable = new RegExp('^' + track + '-(?:sdcleaner-)?v(\\d+\\.\\d+)$').exec(asset.tag);
    const filename = stable && app + '-' + track.toUpperCase() + '-' + stable[1] + '.apk';
    return filename && asset.apkName === filename && asset.apkUrl === base + asset.tag + '/' + filename;
  }

  const status = document.getElementById('download-status');

  function show(catalog) {
    for (const [track, label] of [['adb', 'ADB'], ['shizuku', 'Shizuku']]) {
      const link = document.getElementById('download-' + track);
      const asset = catalog?.stable?.[track];
      if (isValid(asset, track)) {
        link.href = asset.apkUrl;
        link.textContent = 'Download ' + label;
        link.removeAttribute('aria-disabled');
      } else {
        link.removeAttribute('href');
        link.setAttribute('aria-disabled', 'true');
        link.textContent = label + ' unavailable';
      }
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
