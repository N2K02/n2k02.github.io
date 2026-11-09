#!/usr/bin/env bash
# One-time cleanup of legacy website Releases and tags, after app publisher PRs merge.
# Dry-run by default. Requires authenticated gh with repository administration rights.
set -euo pipefail
repo="N2K02/n2k02.github.io"
mode="${1:---dry-run}"
[[ "$mode" == "--dry-run" || "$mode" == "--execute" ]] || {
  echo "Usage: $0 [--dry-run|--execute]" >&2; exit 2;
}
command -v gh >/dev/null || { echo "Install GitHub CLI first" >&2; exit 1; }
command -v jq >/dev/null || { echo "Install jq first" >&2; exit 1; }
root="$(cd "$(dirname "$0")/.." && pwd)"
python3 "$root/scripts/verify_static_site.py"
echo "WARNING: Deleting a release permanently removes its APK assets."
echo "Verify all app publisher PRs are merged and update clients have migrated."
mapfile -t release_data < <(gh api --paginate "repos/$repo/releases?per_page=100" --jq '.[] | [.id,.tag_name] | @tsv')
echo "Legacy releases: ${#release_data[@]}"
for row in "${release_data[@]}"; do
  IFS=$'\t' read -r id tag <<< "$row"
  if [[ "$mode" == "--execute" ]]; then
    gh api -X DELETE "repos/$repo/releases/$id" >/dev/null
    echo "Deleted release: $tag"
  else
    echo "Would delete release: $tag"
  fi
done
mapfile -t refs < <(gh api --paginate "repos/$repo/git/matching-refs/tags" --jq '.[].ref')
echo "Legacy tags: ${#refs[@]}"
for ref in "${refs[@]}"; do
  tag="${ref#refs/tags/}"
  if [[ "$mode" == "--execute" ]]; then
    gh api -X DELETE "repos/$repo/git/refs/tags/$tag" >/dev/null
    echo "Deleted tag: $tag"
  else
    echo "Would delete tag: $tag"
  fi
done
echo "Website cleanup $mode completed."
