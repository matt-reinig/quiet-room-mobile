#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_JSON="$ROOT_DIR/app.json"
APP_BUILD_GRADLE="$ROOT_DIR/android/app/build.gradle"

version_override=""
version_code_override=""
bump_version_code=false
dry_run=false

usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/prepare-android-play.sh [--bump-version-code] [--version-code N] [--version X.Y.Z] [--dry-run]

Examples:
  bash ./scripts/prepare-android-play.sh --bump-version-code
  bash ./scripts/prepare-android-play.sh --version 1.0.1 --version-code 7
  bash ./scripts/prepare-android-play.sh --dry-run --version 1.0.1 --version-code 7
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      version_override="${2:-}"
      shift 2
      ;;
    --version-code)
      version_code_override="${2:-}"
      shift 2
      ;;
    --bump-version-code)
      bump_version_code=true
      shift
      ;;
    --dry-run)
      dry_run=true
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
done

if [[ ! -f "$APP_JSON" ]]; then
  echo "Missing app.json at $APP_JSON" >&2
  exit 1
fi

if [[ -n "$version_code_override" && "$bump_version_code" == true ]]; then
  echo "Use either --version-code or --bump-version-code, not both." >&2
  exit 1
fi

current_version="$(node -p "require(process.argv[1]).expo.version" "$APP_JSON")"
current_version_code="$(node -e "const app=require(process.argv[1]); const value=app.expo?.android?.versionCode ?? ''; process.stdout.write(String(value));" "$APP_JSON")"

if [[ -z "$current_version_code" ]]; then
  current_version_code="1"
fi

target_version="${version_override:-$current_version}"

if [[ -n "$version_code_override" ]]; then
  target_version_code="$version_code_override"
elif [[ "$bump_version_code" == true ]]; then
  target_version_code="$((current_version_code + 1))"
else
  target_version_code="$current_version_code"
fi

if [[ ! "$target_version_code" =~ ^[0-9]+$ ]] || (( target_version_code < 1 )); then
  echo "Version code must be a positive integer. Received: $target_version_code" >&2
  exit 1
fi

if [[ ! "$target_version" =~ ^[0-9]+(\.[0-9]+){1,2}$ ]]; then
  echo "Version must look like X.Y or X.Y.Z. Received: $target_version" >&2
  exit 1
fi

echo "Preparing Android metadata for Play"
echo "  version: $current_version -> $target_version"
echo "  versionCode: $current_version_code -> $target_version_code"
echo

if [[ "$dry_run" == true ]]; then
  echo "Dry run only. No files were changed."
  exit 0
fi

APP_JSON_PATH="$APP_JSON" TARGET_VERSION="$target_version" TARGET_VERSION_CODE="$target_version_code" node <<'NODE'
const fs = require("fs");

const filePath = process.env.APP_JSON_PATH;
const version = process.env.TARGET_VERSION;
const versionCode = Number(process.env.TARGET_VERSION_CODE);

const app = JSON.parse(fs.readFileSync(filePath, "utf8"));
app.expo = app.expo || {};
app.expo.version = version;
app.expo.android = app.expo.android || {};
app.expo.android.versionCode = versionCode;

fs.writeFileSync(filePath, `${JSON.stringify(app, null, 2)}\n`);
NODE

updated_files=("app.json")

if [[ -f "$APP_BUILD_GRADLE" ]]; then
  perl -0pi -e "s/versionCode \\d+/versionCode $target_version_code/; s/versionName \\\"[^\\\"]+\\\"/versionName \\\"$target_version\\\"/" "$APP_BUILD_GRADLE"
  updated_files+=("android/app/build.gradle")
fi

echo "Updated:"
for file in "${updated_files[@]}"; do
  echo "  $file"
done
echo
echo "Next:"
echo "  1. Run npm run android:play:status:qa or npm run android:play:status:prod"
echo "  2. Run npm run android:play:preflight:qa or npm run android:play:preflight:prod"
echo "  3. Build the next Android App Bundle with the matching app variant and release env"
