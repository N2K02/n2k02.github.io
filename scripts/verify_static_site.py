#!/usr/bin/env python3
"""Validate that this repository remains a static website, not an APK host."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
errors = []
workflows = ROOT / ".github" / "workflows"
if workflows.exists():
    for workflow in workflows.iterdir():
        if workflow.name not in {"legacy-update-bridge.yml", "prune-deployments.yml", "actions-storage-retention.yml"}:
            errors.append(f"Unapproved website workflow: {workflow.name}")
if any(ROOT.rglob("*.apk")):
    errors.append("APK files must not be committed to the website")
pages = sorted(ROOT.glob("*/download/index.html"))
if not pages:
    errors.append("No app download pages found")
for page in pages:
    src = page.read_text(encoding="utf-8")
    architecture_page = "/assets/js/architecture-downloads.js" in src
    if ('data-repo="N2K02/' not in src or
        not (architecture_page or "/assets/js/stable-download.js" in src)):
        errors.append(f"{page.relative_to(ROOT)} must resolve its source GitHub stable release")
    if architecture_page:
        catalog = json.loads(page.with_name("apks.json").read_text())
        for track in ("adb", "shizuku"):
            if src.count(f'id="download-{track}"') != 1 or f'id="{track}-description"' not in src:
                errors.append(f"{page.relative_to(ROOT)} lacks a single {track} download with a description")
        if 'id="release-channel"' in src or 'id="download-heading">Stable downloads' not in src:
            errors.append(f"{page.relative_to(ROOT)} must display stable downloads only")
        if set(catalog.get("stable", {})) != {"adb", "shizuku"}:
            errors.append(f"{page.relative_to(ROOT)} lacks the stable APK choices")
for manifest in ROOT.glob("*/updates/*.json"):
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except (ValueError, OSError) as exc:
        errors.append(f"{manifest.relative_to(ROOT)}: {exc}")
        continue
    for field in ("apkUrl", "pageUrl"):
        if "github.com/N2K02/n2k02.github.io/releases/" in str(data.get(field, "")):
            errors.append(f"{manifest.relative_to(ROOT)}: {field} references website release")
js = ROOT / "assets" / "js" / "stable-download.js"
if not js.exists():
    errors.append("Missing shared source-release download resolver")
else:
    script = js.read_text(encoding="utf-8")
    if "/releases/latest" not in script or "release.prerelease" not in script:
        errors.append("Shared download resolver must verify stable source releases")
if errors:
    raise SystemExit("Static website policy violations:\n" + "\n".join(errors))
print(f"Static website policy checks passed ({len(pages)} download pages)")
