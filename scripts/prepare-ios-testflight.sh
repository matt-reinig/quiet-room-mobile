#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_JSON="$ROOT_DIR/app.json"
INFO_PLIST="$ROOT_DIR/ios/quietroommobile/Info.plist"
PBXPROJ="$ROOT_DIR/ios/quietroommobile.xcodeproj/project.pbxproj"
PLIST_BUDDY="/usr/libexec/PlistBuddy"

version_override=""
build_override=""
bump_build=false
dry_run=false

usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/prepare-ios-testflight.sh [--bump-build] [--build-number N] [--version X.Y.Z] [--dry-run]

Examples:
  bash ./scripts/prepare-ios-testflight.sh --bump-build
  bash ./scripts/prepare-ios-testflight.sh --version 1.0.1 --build-number 7
  bash ./scripts/prepare-ios-testflight.sh --dry-run --version 1.0.1 --build-number 7
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      version_override="${2:-}"
      shift 2
      ;;
    --build-number)
      build_override="${2:-}"
      shift 2
      ;;
    --bump-build)
      bump_build=true
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

if [[ ! -f "$APP_JSON" || ! -f "$INFO_PLIST" || ! -f "$PBXPROJ" ]]; then
  echo "Missing one or more required project files for iOS release prep." >&2
  exit 1
fi

if [[ -n "$build_override" && "$bump_build" == true ]]; then
  echo "Use either --build-number or --bump-build, not both." >&2
  exit 1
fi

current_version="$(node -p "require(process.argv[1]).expo.version" "$APP_JSON")"
current_build_number="$(node -e "const app=require(process.argv[1]); const value=app.expo?.ios?.buildNumber ?? ''; process.stdout.write(String(value));" "$APP_JSON")"

if [[ -z "$current_build_number" ]]; then
  current_build_number="$("$PLIST_BUDDY" -c "Print :CFBundleVersion" "$INFO_PLIST")"
fi

target_version="${version_override:-$current_version}"

if [[ -n "$build_override" ]]; then
  target_build_number="$build_override"
elif [[ "$bump_build" == true ]]; then
  target_build_number="$((current_build_number + 1))"
else
  target_build_number="$current_build_number"
fi

if [[ ! "$target_build_number" =~ ^[0-9]+$ ]] || (( target_build_number < 1 )); then
  echo "Build number must be a positive integer. Received: $target_build_number" >&2
  exit 1
fi

if [[ ! "$target_version" =~ ^[0-9]+(\.[0-9]+){1,2}$ ]]; then
  echo "Version must look like X.Y or X.Y.Z. Received: $target_version" >&2
  exit 1
fi

echo "Preparing iOS metadata for TestFlight"
echo "  version: $current_version -> $target_version"
echo "  build: $current_build_number -> $target_build_number"
echo

if [[ "$dry_run" == true ]]; then
  echo "Dry run only. No files were changed."
  exit 0
fi

APP_JSON_PATH="$APP_JSON" TARGET_VERSION="$target_version" TARGET_BUILD_NUMBER="$target_build_number" node <<'NODE'
const fs = require("fs");

const filePath = process.env.APP_JSON_PATH;
const version = process.env.TARGET_VERSION;
const buildNumber = process.env.TARGET_BUILD_NUMBER;

const app = JSON.parse(fs.readFileSync(filePath, "utf8"));
app.expo = app.expo || {};
app.expo.version = version;
app.expo.ios = app.expo.ios || {};
app.expo.ios.buildNumber = buildNumber;

fs.writeFileSync(filePath, `${JSON.stringify(app, null, 2)}\n`);
NODE

"$PLIST_BUDDY" -c "Set :CFBundleShortVersionString $target_version" "$INFO_PLIST"
"$PLIST_BUDDY" -c "Set :CFBundleVersion $target_build_number" "$INFO_PLIST"

perl -0pi -e "s/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = $target_version;/g; s/CURRENT_PROJECT_VERSION = [^;]+;/CURRENT_PROJECT_VERSION = $target_build_number;/g" "$PBXPROJ"

echo "Updated:"
echo "  app.json"
echo "  ios/quietroommobile/Info.plist"
echo "  ios/quietroommobile.xcodeproj/project.pbxproj"
echo
echo "Next:"
echo "  1. Run npm run ios:testflight:status"
echo "  2. Open ios/quietroommobile.xcworkspace in Xcode"
echo "  3. Archive a Release build and upload it to App Store Connect"
