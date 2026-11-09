# Static website repository policy

This repository hosts only the static N2K02 website and public update metadata.

- Do not publish GitHub Releases, APK binaries, or app version tags here.
- Do not add Android build, signing, distribution, or release-publishing workflows.
- App APKs and version tags belong in their own app repositories.
- Public download pages must link to the latest stable APK in the corresponding app repository.
- Existing update manifests must not be deleted or redirected until each consuming app's updater and publishing workflow has migrated.
- GitHub Pages deployment may continue through GitHub's built-in Pages deployment or an approved Pages-only workflow.

## Enforcement required in repository settings

This file documents policy but does not itself prevent API writes. Restrict Actions permissions, remove app-distribution tokens with access to this repository, and configure a ruleset that blocks tag creation and release publishing where supported. GitHub Releases have no native repository-level 'disable releases' switch; prevent publishing through credentials/permissions and audit for violations.

Before removing legacy releases and tags, migrate and verify all external app publishers and consumers. Deleting a release permanently removes its hosted APK assets.

## Validation and legacy cleanup

Run `python3 scripts/verify_static_site.py` after any website change. The 15 download pages use `/assets/js/stable-download.js`, which resolves the current stable source-repository APK at page load. In-app update JSON feeds remain for compatibility, but their APK URLs must point to the corresponding app's own releases.

After merging the SDCleaner, McpAdbAndroidLogger and other source-version PRs, use GitHub CLI authenticated as a repository administrator:

```bash
bash scripts/cleanup_website_releases.sh --dry-run
bash scripts/cleanup_website_releases.sh --execute
```

The cleanup deletes all legacy website releases and website tags; it does not touch release assets or tags in the individual Android app repositories. It is intentionally **not** automated in GitHub Actions. Review the dry-run before deleting any historical APKs.

GitHub repository administration is required to remove external distribution credentials and restrict Actions write permission; static code files alone cannot enforce those GitHub permissions.
