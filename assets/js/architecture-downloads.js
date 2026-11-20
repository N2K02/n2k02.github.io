(() => {
  'use strict';
  const repository = document.currentScript.dataset.repo;
  if (!/^N2K02\/[A-Za-z0-9_-]+$/.test(repository)) return;
  const app = repository.split('/')[1];
  const base = 'https://github.com/' + repository + '/releases/download/';
  const esc = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function isValid(asset, channel, track) {
    if (!asset || typeof asset.tag !== 'string' || typeof asset.apkName !== 'string') return false;
    const stable = new RegExp('^' + track + '-(?:sdcleaner-)?v(\\d+\\.\\d+)$').exec(asset.tag);
    const prefix = app + '-' + track.toUpperCase() + '-';
    const rightFile = channel === 'stable'
      ? stable && asset.apkName === prefix + stable[1] + '.apk'
      : new RegExp('^experimental-' + track + '-pr-\\d+-run-\\d+$').test(asset.tag) &&
        new RegExp('^' + esc(prefix) + '\\d+\\.\\d+-experimental\\.\\d+\\.apk$').test(asset.apkName);
    return rightFile && asset.apkUrl === base + asset.tag + '/' + asset.apkName;
  }

  const channelSelect = document.getElementById('release-channel');
  const status = document.getElementById('download-status');

  function show(catalog) {
    const channel = channelSelect?.value ?? 'stable';
    for (const [track, label] of [['adb', 'ADB'], ['shizuku', 'Shizuku']]) {
      const link = document.getElementById('download-' + track);
      const asset = catalog?.[channel]?.[track];
      if (isValid(asset, channel, track)) {
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
      if (channelSelect) {
        channelSelect.addEventListener('change', () => show(catalog));
        channelSelect.disabled = false;
      }
      status.textContent = '';
    }, () => {
      show(null);
      status.textContent = 'The APK list could not be loaded. See all GitHub releases below.';
    });
})();
