#!/usr/bin/env bash
# Remove unreferenced APK-bearing releases from N2K02/n2k02.github.io.
# Run from the repository root. Defaults to dry-run; pass --delete to remove releases.
# Git tags are intentionally preserved.

set -euo pipefail

REPOSITORY="N2K02/n2k02.github.io"
MODE="dry-run"

usage() {
  cat <<'USAGE'
Usage: bash .github/scripts/cleanup-apk-releases.sh [--dry-run | --delete]

Default: list APK-bearing releases that are not referenced by any local
updates/*.json manifest. --delete removes those GitHub Release records and
their uploaded assets. It leaves Git tags intact.
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

command -v gh >/dev/null || { echo "GitHub CLI (gh) is required." >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required." >&2; exit 1; }
gh auth status >/dev/null

mapfile -d '' manifests < <(find . -type f -path '*/updates/*.json' -print0)
if (("${#manifests[@]}" == 0)); then
  echo "No update manifests found; refusing to inspect/delete releases." >&2
  exit 1
fi

declare -A referenced_tags=()
for manifest in "${manifests[@]}"; do
  tag=$(jq -r '.tag // empty' "$manifest")
  if [[ -n "$tag" ]]; then
    referenced_tags["$tag"]="$manifest"
  fi
done

tmp_file=$(mktemp)
trap 'rm -f "$tmp_file"' EXIT

# gh emits one JSON array per page; jq -s combines them into one release array.
gh api --paginate "repos/$REPOSITORY/releases?per_page=100" | jq -s 'add // []' > "$tmp_file"

candidate_count=0
skipped_count=0
deleted_count=0

while IFS=$'\t' read -r release_id tag name apk_names; do
  [[ -n "$release_id" ]] || continue
  if [[ -n "${referenced_tags[$tag]:-}" ]]; then
    printf 'SKIP  %-55s referenced by %s\n' "$tag" "${referenced_tags[$tag]}"
    ((skipped_count += 1))
    continue
  fi

  ((candidate_count += 1))
  if [[ "$MODE" == "delete" ]]; then
    gh api --method DELETE "repos/$REPOSITORY/releases/$release_id" >/dev/null
    printf 'DELETED %-54s %s\n' "$tag" "$apk_names"
    ((deleted_count += 1))
  else
    printf 'DRY-RUN %-54s %s\n' "$tag" "$apk_names"
  fi
done < <(
  jq -r '
    .[]
    | select(any(.assets[]?; (.name | ascii_downcase | endswith(".apk"))))
    | [.id, .tag_name, .name, ([.assets[]? | select(.name | ascii_downcase | endswith(".apk")) | .name] | join(","))]
    | @tsv
  ' "$tmp_file"
)

printf '\nMode: %s | removable releases: %d | feed-referenced releases skipped: %d' \
  "$MODE" "$candidate_count" "$skipped_count"
if [[ "$MODE" == "delete" ]]; then
  printf ' | deleted: %d' "$deleted_count"
fi
printf '\n'
