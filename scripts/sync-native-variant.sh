#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_ASSET_ROOT="${MOBILE_RELEASE_ASSET_ROOT:-$ROOT_DIR}"
APP_VARIANT="${1:-qa}"
RELEASE_ENV="${2:-qa}"
PLATFORM="${3:-all}"

case "$APP_VARIANT" in
  qa|prod)
    ;;
  *)
    echo "Unsupported app variant: $APP_VARIANT" >&2
    echo "Expected one of: qa, prod" >&2
    exit 1
    ;;
esac

case "$RELEASE_ENV" in
  local|qa|prod)
    ;;
  *)
    echo "Unsupported release env: $RELEASE_ENV" >&2
    echo "Expected one of: local, qa, prod" >&2
    exit 1
    ;;
esac

case "$PLATFORM" in
  all|ios|android)
    ;;
  *)
    echo "Unsupported platform: $PLATFORM" >&2
    echo "Expected one of: all, ios, android" >&2
    exit 1
    ;;
esac

if [[ "$APP_VARIANT" == "prod" && "$RELEASE_ENV" != "prod" ]]; then
  echo "Refusing to sync prod app variant with non-prod release env." >&2
  exit 1
fi

echo "Syncing native projects"
echo "  app variant: $APP_VARIANT"
echo "  release env: $RELEASE_ENV"
echo "  platform: $PLATFORM"
echo

if [[ -z "${EXPO_PUBLIC_GOOGLE_SERVICES_FILE:-}" ]]; then
  case "$APP_VARIANT" in
    qa) android_google_services_file="$RELEASE_ASSET_ROOT/google-services.qa.json" ;;
    prod) android_google_services_file="$RELEASE_ASSET_ROOT/google-services.prod.json" ;;
  esac
  if [[ -f "${android_google_services_file:-}" ]]; then
    export EXPO_PUBLIC_GOOGLE_SERVICES_FILE="$android_google_services_file"
    echo "Using Android Google services from $EXPO_PUBLIC_GOOGLE_SERVICES_FILE"
    echo
  fi
fi

(
  cd "$ROOT_DIR"
  EXPO_PUBLIC_APP_VARIANT="$APP_VARIANT" \
  EXPO_PUBLIC_RELEASE_ENV="$RELEASE_ENV" \
  node -e "const c=require('./app.config.js').expo; console.log(JSON.stringify({name:c.name, scheme:c.scheme, bundleIdentifier:c.ios.bundleIdentifier, package:c.android.package, iosGoogleServicesFile:c.ios.googleServicesFile, androidGoogleServicesFile:c.android.googleServicesFile, extra:c.extra}, null, 2));"
)

echo

(
  cd "$ROOT_DIR"
  EXPO_PUBLIC_APP_VARIANT="$APP_VARIANT" \
  EXPO_PUBLIC_RELEASE_ENV="$RELEASE_ENV" \
  npx expo prebuild --clean --no-install --platform "$PLATFORM"
)

if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
  echo
  echo "Patching Android app Gradle"
  (
    cd "$ROOT_DIR"
    node ./scripts/patch-android-gradle.js
  )
fi

if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]]; then
  echo
  echo "Patching iOS Podfile"
  (
    cd "$ROOT_DIR"
    node ./scripts/patch-ios-podfile.js
  )

  echo
  echo "Installing iOS pods"
  (
    cd "$ROOT_DIR/ios"
    pod install
  )

  echo
  echo "Patching iOS Xcode project signing"
  (
    cd "$ROOT_DIR"
    node ./scripts/patch-ios-xcodeproj-signing.js
  )
fi
