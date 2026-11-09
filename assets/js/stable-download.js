/* Stable APK download links come exclusively from each app's own GitHub Releases.
 * The static website never hosts or publishes APKs.
 */
(() => {
  'use strict';
  const script = document.currentScript;
  const ownerRepo = script && script.dataset.repo;
  if (!/^N2K02\/[A-Za-z0-9_-]+$/.test(ownerRepo || '') ||
      ownerRepo.toLowerCase() === 'n2k02/n2k02.github.io') return;
  const version = document.getElementById('version');
  const details = document.getElementById('details');
  const link = document.getElementById('download');
  const notes = document.getElementById('notes') || document.getElementById('note');
  if (!version || !details || !link) return;
  const releaseUrl = 'https://github.com/' + ownerRepo + '/releases/latest';
  link.href = releaseUrl;
  link.textContent = 'View latest stable release';
  link.removeAttribute('aria-disabled');
  link.removeAttribute('tabindex');
  version.textContent = 'Checking latest stable release…';
  details.textContent = 'Checking the official app repository.';
  fetch('https://api.github.com/repos/' + ownerRepo + '/releases/latest',
    {headers: {'Accept': 'application/vnd.github+json'}, cache: 'no-store'})
    .then(response => {
      if (!response.ok) throw Error('GitHub API unavailable');
      return response.json();
    })
    .then(release => {
      if (!release || release.draft || release.prerelease) throw Error('Not stable');
      const assets = Array.isArray(release.assets) ? release.assets : [];
      const expectedPrefix = ownerRepo.split('/')[1].toLowerCase() + '-';
      const apk = assets.find(asset =>
        typeof asset.name === 'string' &&
        asset.name.toLowerCase().startsWith(expectedPrefix) &&
        asset.name.toLowerCase().endsWith('.apk') &&
        typeof asset.browser_download_url === 'string' &&
        asset.browser_download_url.startsWith('https://github.com/' + ownerRepo + '/releases/download/'));
      if (!apk) throw Error('No signed APK in stable release');
      version.textContent = ownerRepo.split('/')[1] + ' ' + (release.tag_name || 'latest');
      details.textContent = 'Stable APK' +
        (Number.isFinite(apk.size) ? ' · ' + (apk.size / 1048576).toFixed(1) + ' MB' : '');
      link.href = apk.browser_download_url;
      link.textContent = '↓ Download latest stable APK';
      if (notes) notes.textContent = 'Official GitHub release · Experimental builds excluded.';
    })
    .catch(() => {
      version.textContent = 'Latest stable release';
      details.textContent = 'Direct APK lookup unavailable. Open the official latest stable release.';
      if (notes) notes.textContent = 'APK files are hosted only in the app repository.';
    });
})();
