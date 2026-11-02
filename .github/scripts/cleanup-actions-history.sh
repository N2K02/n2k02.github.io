#!/usr/bin/env bash
# Remove old completed GitHub Actions run records while retaining the latest
# successful GitHub Pages deployment and any currently running jobs.
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN is required}"
: "${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
REPOSITORY="${GITHUB_REPOSITORY:-N2K02/n2k02.github.io}"

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

gh api --paginate "repos/$REPOSITORY/actions/runs?per_page=100" > "$tmp_dir/pages.json"
jq -s '[.[] | .workflow_runs[]] | unique_by(.id) | sort_by(.created_at)' "$tmp_dir/pages.json" > "$tmp_dir/runs.json"

latest_pages=$(jq -r '
  [.[] | select(.name == "pages build and deployment" and .status == "completed" and .conclusion == "success")]
  | sort_by(.created_at) | last | .id // empty
' "$tmp_dir/runs.json")

[[ -n "$latest_pages" ]] || {
  echo "No successful Pages run found; refusing to remove any run history." >&2
  exit 1
}

jq -r --arg current "$GITHUB_RUN_ID" --arg keep "$latest_pages" '
  .[]
  | select(.status == "completed")
  | select((.id | tostring) != $current)
  | select((.id | tostring) != $keep)
  | .id
' "$tmp_dir/runs.json" > "$tmp_dir/delete-ids.txt"

total=$(wc -l < "$tmp_dir/delete-ids.txt" | tr -d ' ')
echo "Keeping latest successful Pages run $latest_pages and active runs."
echo "Deleting $total older completed Actions runs."

delete_run() {
  local run_id="$1"
  local attempt=1
  local err_file
  err_file=$(mktemp)
  while (( attempt <= 6 )); do
    if gh api --method DELETE "repos/$REPOSITORY/actions/runs/$run_id" >/dev/null 2>"$err_file"; then
      echo "Deleted run $run_id"
      rm -f "$err_file"
      return 0
    fi
    if grep -Eqi 'rate limit|secondary rate|abuse detection|try again later' "$err_file"; then
      echo "Rate limited deleting $run_id; retry $attempt/6 after 60 seconds" >&2
      sleep 60
      ((attempt += 1))
      continue
    fi
    cat "$err_file" >&2
    rm -f "$err_file"
    return 1
  done
  cat "$err_file" >&2
  rm -f "$err_file"
  return 1
}
export -f delete_run
export REPOSITORY
xargs -r -n 1 -P 3 bash -c 'delete_run "$1"' _ < "$tmp_dir/delete-ids.txt"

remaining=$(gh api --paginate "repos/$REPOSITORY/actions/runs?per_page=100" |
  jq -s '[.[] | .workflow_runs[]] | unique_by(.id) | length')
echo "Cleanup complete. Actions run records remaining: $remaining"
