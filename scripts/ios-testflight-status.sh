#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_JSON="$ROOT_DIR/app.json"
APP_CONFIG_JS="$ROOT_DIR/app.config.js"
EXPECTED_APP_VARIANT="${1:-${EXPO_PUBLIC_APP_VARIANT:-}}"
EXPECTED_RELEASE_ENV="${2:-${EXPO_PUBLIC_RELEASE_ENV:-}}"
IOS_DIR="$ROOT_DIR/ios"
INFO_PLIST="$(find "$IOS_DIR" -maxdepth 2 -name Info.plist | head -n 1 || true)"
PBXPROJ="$(find "$IOS_DIR" -maxdepth 2 -path "*.xcodeproj/project.pbxproj" | head -n 1 || true)"
PLIST_BUDDY="/usr/libexec/PlistBuddy"

if [[ ! -f "$APP_JSON" || ! -f "$APP_CONFIG_JS" ]]; then
  echo "Missing app config file at $ROOT_DIR" >&2
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

app_name="$(node -p "require(process.argv[1]).expo.name" "$APP_CONFIG_JS")"
app_slug="$(node -p "require(process.argv[1]).expo.slug" "$APP_CONFIG_JS")"
app_version="$(node -p "require(process.argv[1]).expo.version" "$APP_JSON")"
app_bundle_id="$(node -p "require(process.argv[1]).expo.ios.bundleIdentifier" "$APP_CONFIG_JS")"
app_build_number="$(node -e "const app=require(process.argv[1]); const value=app.expo?.ios?.buildNumber ?? ''; process.stdout.write(String(value));" "$APP_JSON")"
app_scheme="$(node -p "require(process.argv[1]).expo.scheme" "$APP_CONFIG_JS")"
app_variant="$(node -p "require(process.argv[1]).expo.extra?.appVariant ?? ''" "$APP_CONFIG_JS")"
release_env="$(node -p "require(process.argv[1]).expo.extra?.releaseEnv ?? ''" "$APP_CONFIG_JS")"
ios_google_services_file="$(node -p "require(process.argv[1]).expo.ios?.googleServicesFile ?? ''" "$APP_CONFIG_JS")"
api_base="${EXPO_PUBLIC_API_BASE:-}"
streaming_base="${EXPO_PUBLIC_STREAMING_BASE:-}"
web_app_url="${EXPO_PUBLIC_WEB_APP_URL:-}"
firebase_project_id="${EXPO_PUBLIC_FB_PROJECT_ID:-}"

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
echo "  scheme: $app_scheme"
echo "  extra.appVariant: ${app_variant:-<unset>}"
echo "  extra.releaseEnv: ${release_env:-<unset>}"
echo "  ios.buildNumber: ${app_build_number:-<unset>}"
echo "  ios.bundleIdentifier: $app_bundle_id"
echo "  ios.googleServicesFile: ${ios_google_services_file:-<unset>}"
echo
echo "Loaded env"
echo "  expected app variant: ${EXPECTED_APP_VARIANT:-<unspecified>}"
echo "  expected release env: ${EXPECTED_RELEASE_ENV:-<unspecified>}"
echo "  base env file: ${MOBILE_ENV_BASE_FILE:-<unset>}"
echo "  overlay env file: ${MOBILE_ENV_OVERLAY_FILE:-<unset>}"
echo
echo "Runtime config"
echo "  apiBase: ${api_base:-<unset>}"
echo "  streamingBase: ${streaming_base:-<unset>}"
echo "  webAppUrl: ${web_app_url:-<unset>}"
echo "  firebaseProjectId: ${firebase_project_id:-<unset>}"
echo
echo "Native iOS config"
echo "  Info.plist: ${INFO_PLIST#$ROOT_DIR/}"
echo "  Xcode project: ${PBXPROJ#$ROOT_DIR/}"
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
