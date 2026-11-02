#!/usr/bin/env bash
# Clean the static website repository: remove unreferenced GitHub Releases and
# stale remote branches. Keeps main, open-PR branches, and feed-linked releases.
# Dry-run is the default. Git tags are preserved.

set -euo pipefail

REPOSITORY="N2K02/n2k02.github.io"
MODE="dry-run"

usage() {
  cat <<'USAGE'
Usage:
  bash .github/scripts/cleanup-apk-releases.sh          # preview
  bash .github/scripts/cleanup-apk-releases.sh --delete # delete listed items

Run from a clean, up-to-date checkout of main. The script preserves releases
whose tags are still referenced by updates/*.json, preserves Git tags, keeps
the main branch, and skips branches used by open pull requests.
USAGE
}

while (($#)); do
  case "$1" in
    --dry-run) MODE="dry-run" ;;
    --delete) MODE="delete" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

for tool in gh jq git; do
  command -v "$tool" >/dev/null || { echo "Required command not found: $tool" >&2; exit 1; }
done
gh auth status >/dev/null

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "Run this script from a clone of $REPOSITORY." >&2
  exit 1
}
cd "$ROOT"
[[ "$(git remote get-url origin)" == *"N2K02/n2k02.github.io"* ]] || {
  echo "The current checkout is not N2K02/n2k02.github.io." >&2
  exit 1
}
branch=$(git branch --show-current)
[[ -z "$branch" || "$branch" == "main" ]] || {
  echo "Check out main before running cleanup." >&2
  exit 1
}
[[ -z "$(git status --porcelain)" ]] || {
  echo "Commit or discard local changes before running cleanup." >&2
  exit 1
}

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

# Update local feed references first, so the release safety check uses main.
git fetch origin main --quiet
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || {
  echo "Local main is behind or ahead of origin/main. Run: git pull --ff-only" >&2
  exit 1
}

mapfile -d '' manifests < <(find . -type f -path '*/updates/*.json' -print0)
(("${#manifests[@]}" > 0)) || {
  echo "No update manifests found; refusing release cleanup." >&2
  exit 1
}

declare -A referenced_tags=()
for manifest in "${manifests[@]}"; do
  jq -e . "$manifest" >/dev/null || {
    echo "Invalid JSON manifest: $manifest" >&2
    exit 1
  }
  tag=$(jq -r '.tag // empty' "$manifest")
  [[ -z "$tag" ]] || referenced_tags["$tag"]="$manifest"
done

gh api --paginate "repos/$REPOSITORY/releases?per_page=100" |
  jq -s 'add // []' > "$tmp_dir/releases.json"
gh api --paginate "repos/$REPOSITORY/branches?per_page=100" |
  jq -s 'add // []' > "$tmp_dir/branches.json"
gh pr list --repo "$REPOSITORY" --state open --limit 1000 \
  --json headRefName --jq '.[].headRefName' > "$tmp_dir/open-pr-branches.txt"

release_count=0
release_skipped=0
branch_count=0
branch_skipped=0

while IFS= read -r item; do
  id=$(jq -r '.id' <<<"$item")
  tag=$(jq -r '.tag_name' <<<"$item")
  name=$(jq -r '.name // .tag_name' <<<"$item")

  if [[ -n "${referenced_tags[$tag]:-}" ]]; then
    printf 'KEEP release  %-48s referenced by %s\n' "$tag" "${referenced_tags[$tag]}"
    ((release_skipped += 1))
    continue
  fi

  if [[ "$MODE" == "delete" ]]; then
    gh api --method DELETE "repos/$REPOSITORY/releases/$id" >/dev/null
    printf 'DELETED release %s\n' "$name"
  else
    printf 'WOULD DELETE release %s\n' "$name"
  fi
  ((release_count += 1))
done < <(jq -c '.[]' "$tmp_dir/releases.json")

while IFS= read -r branch; do
  [[ "$branch" == "main" ]] && continue

  if grep -Fxq -- "$branch" "$tmp_dir/open-pr-branches.txt"; then
    printf 'KEEP branch   %s (open pull request)\n' "$branch"
    ((branch_skipped += 1))
    continue
  fi

  if [[ "$MODE" == "delete" ]]; then
    gh api --method DELETE "repos/$REPOSITORY/git/refs/heads/$branch" >/dev/null
    printf 'DELETED branch %s\n' "$branch"
  else
    printf 'WOULD DELETE branch %s\n' "$branch"
  fi
  ((branch_count += 1))
done < <(jq -r '.[].name' "$tmp_dir/branches.json")

printf '\nMode: %s | releases: %d removable, %d feed-linked kept | branches: %d removable, %d open-PR branches kept\n' \
  "$MODE" "$release_count" "$release_skipped" "$branch_count" "$branch_skipped"
