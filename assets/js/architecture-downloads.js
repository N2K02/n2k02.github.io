(() => {
  'use strict';
  const {repo: repository, mainStable} = document.currentScript.dataset;
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

  if (mainStable === 'shizuku' && repository === 'N2K02/SDCleaner') {
    const link = document.getElementById('download-shizuku');
    // Track-qualified tags preserve updater compatibility. Only main builds carry the source marker.
    fetch('https://api.github.com/repos/' + repository + '/releases?per_page=100', {cache: 'no-store'})
      .then(response => {
        if (!response.ok) throw Error('Release list unavailable');
        return response.json();
      })
      .then(releases => {
        for (const release of releases) {
          const version = /^shizuku-sdcleaner-v(\d+\.\d+)$/.exec(release.tag_name);
          if (!version || release.draft || release.prerelease ||
              !/^Source branch: main$/m.test(release.body || '')) continue;
          const filename = app + '-SHIZUKU-' + version[1] + '.apk';
          const url = base + release.tag_name + '/' + filename;
          if (release.assets?.some(asset => asset.name === filename && asset.browser_download_url === url)) {
            setLink(link, 'Shizuku', url);
            status.textContent = '';
            return;
          }
        }
        setLink(link, 'Shizuku');
        status.textContent = 'A stable Shizuku APK from main is currently unavailable.';
      })
      .catch(() => {
        setLink(link, 'Shizuku');
        status.textContent = 'The stable Shizuku release could not be checked. Try again later.';
      });
    return;
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
