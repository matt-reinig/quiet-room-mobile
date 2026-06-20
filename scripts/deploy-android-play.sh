#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
lane="${1:-}"
release_env="${2:-}"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/deploy-android-play.sh <qa|prod> <qa|prod> --dry-run [--aab <path>]
  bash scripts/deploy-android-play.sh <qa|prod> <qa|prod> --apply [--complete] [--aab <path>] [--release-notes <text>]

Examples:
  npm run android:play:deploy:qa -- --dry-run
  npm run android:play:deploy:qa -- --apply --complete --confirm-publish --release-notes 'QA internal build.'
  npm run android:play:deploy:prod -- --apply --complete --confirm-publish --release-notes 'Prod candidate.'

Behavior:
  - Runs the lane-specific Play preflight before building or uploading.
  - Builds android/app/build/outputs/bundle/release/app-release.aab unless --aab is supplied.
  - --dry-run never contacts Google Play.
  - --apply uploads a draft release unless --complete is also supplied.
  - --complete needs --confirm-publish. Prod mutations also require --allow-prod
    internally; the prod wrapper supplies that only after --apply is selected.
EOF
}

if [[ "$lane" != "qa" && "$lane" != "prod" ]]; then
  usage >&2
  exit 1
fi

expected_release_env="$lane"
if [[ "$release_env" != "$expected_release_env" ]]; then
  echo "Expected release environment $expected_release_env for lane $lane, received ${release_env:-<unset>}." >&2
  exit 1
fi

shift 2
dry_run=false
apply=false
complete=false
confirm_publish=false
aab_path=""
release_notes=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      dry_run=true
      ;;
    --apply)
      apply=true
      ;;
    --complete)
      complete=true
      ;;
    --confirm-publish)
      confirm_publish=true
      ;;
    --aab)
      aab_path="${2:-}"
      shift
      ;;
    --release-notes)
      release_notes="${2:-}"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [[ "$dry_run" == true && "$apply" == true ]]; then
  echo "Choose either --dry-run or --apply, not both." >&2
  exit 1
fi

if [[ "$dry_run" != true && "$apply" != true ]]; then
  echo "Choose --dry-run or --apply." >&2
  exit 1
fi

if [[ "$complete" == true && "$apply" != true ]]; then
  echo "--complete can only be used with --apply." >&2
  exit 1
fi

if [[ "$complete" == true && "$confirm_publish" != true ]]; then
  echo "--complete requires --confirm-publish." >&2
  exit 1
fi

echo "Android Play ${lane} deployment"
echo
bash "$ROOT_DIR/scripts/android-play-preflight.sh" "$lane" "$release_env"

if [[ -z "$aab_path" ]]; then
  echo
  echo "Building signed ${lane} Android App Bundle"
  (
    cd "$ROOT_DIR/android"
    ./gradlew bundleRelease
  )
  aab_path="$ROOT_DIR/android/app/build/outputs/bundle/release/app-release.aab"
elif [[ "$aab_path" != /* ]]; then
  aab_path="$ROOT_DIR/$aab_path"
fi

if [[ ! -f "$aab_path" ]]; then
  echo "Missing Android App Bundle: $aab_path" >&2
  exit 1
fi

helper_args=(--lane "$lane" --aab "$aab_path")
if [[ -n "$release_notes" ]]; then
  helper_args+=(--release-notes "$release_notes")
fi

if [[ "$dry_run" == true ]]; then
  node "$ROOT_DIR/scripts/google-play-release.mjs" --dry-run "${helper_args[@]}"
  exit 0
fi

helper_args=(--upload --apply "${helper_args[@]}")
if [[ "$complete" == true ]]; then
  helper_args+=(--complete --confirm-publish)
fi
if [[ "$lane" == "prod" ]]; then
  helper_args+=(--allow-prod)
fi

node "$ROOT_DIR/scripts/google-play-release.mjs" "${helper_args[@]}"
