#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_JSON="$ROOT_DIR/app.json"
INFO_PLIST="$ROOT_DIR/ios/quietroommobile/Info.plist"
PBXPROJ="$ROOT_DIR/ios/quietroommobile.xcodeproj/project.pbxproj"
PLIST_BUDDY="/usr/libexec/PlistBuddy"

if [[ ! -f "$APP_JSON" ]]; then
  echo "Missing app.json at $APP_JSON" >&2
  exit 1
fi

if [[ ! -f "$INFO_PLIST" ]]; then
  echo "Missing Info.plist at $INFO_PLIST" >&2
  exit 1
fi

if [[ ! -f "$PBXPROJ" ]]; then
  echo "Missing Xcode project file at $PBXPROJ" >&2
  exit 1
fi

app_name="$(node -p "require(process.argv[1]).expo.name" "$APP_JSON")"
app_slug="$(node -p "require(process.argv[1]).expo.slug" "$APP_JSON")"
app_version="$(node -p "require(process.argv[1]).expo.version" "$APP_JSON")"
app_bundle_id="$(node -p "require(process.argv[1]).expo.ios.bundleIdentifier" "$APP_JSON")"
app_build_number="$(node -e "const app=require(process.argv[1]); const value=app.expo?.ios?.buildNumber ?? ''; process.stdout.write(String(value));" "$APP_JSON")"

plist_display_name="$("$PLIST_BUDDY" -c "Print :CFBundleDisplayName" "$INFO_PLIST")"
plist_version="$("$PLIST_BUDDY" -c "Print :CFBundleShortVersionString" "$INFO_PLIST")"
plist_build_number="$("$PLIST_BUDDY" -c "Print :CFBundleVersion" "$INFO_PLIST")"

xcode_marketing_version="$(sed -n 's/.*MARKETING_VERSION = \(.*\);/\1/p' "$PBXPROJ" | head -n 1)"
xcode_project_build="$(sed -n 's/.*CURRENT_PROJECT_VERSION = \(.*\);/\1/p' "$PBXPROJ" | head -n 1)"
xcode_bundle_id="$(sed -n 's/.*PRODUCT_BUNDLE_IDENTIFIER = \(.*\);/\1/p' "$PBXPROJ" | head -n 1)"

echo "Expo config"
echo "  name: $app_name"
echo "  slug: $app_slug"
echo "  version: $app_version"
echo "  ios.buildNumber: ${app_build_number:-<unset>}"
echo "  ios.bundleIdentifier: $app_bundle_id"
echo
echo "Native iOS config"
echo "  CFBundleDisplayName: $plist_display_name"
echo "  CFBundleShortVersionString: $plist_version"
echo "  CFBundleVersion: $plist_build_number"
echo "  MARKETING_VERSION: $xcode_marketing_version"
echo "  CURRENT_PROJECT_VERSION: $xcode_project_build"
echo "  PRODUCT_BUNDLE_IDENTIFIER: $xcode_bundle_id"
echo

if [[ -z "$app_build_number" ]]; then
  echo "Warning: app.json does not currently set expo.ios.buildNumber."
fi

if [[ "$app_version" != "$plist_version" || "$app_version" != "$xcode_marketing_version" ]]; then
  echo "Warning: version metadata is not fully aligned across Expo and native iOS files."
fi

if [[ -n "$app_build_number" && ( "$app_build_number" != "$plist_build_number" || "$app_build_number" != "$xcode_project_build" ) ]]; then
  echo "Warning: build number metadata is not fully aligned across Expo and native iOS files."
fi
