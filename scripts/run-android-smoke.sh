#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_VARIANT="${1:-}"
RELEASE_ENV="${2:-}"
DETOX_CONFIG="${3:-${DETOX_ANDROID_CONFIG:-android.emu.release}}"
DETOX_NODE_OPTIONS="--require $ROOT_DIR/scripts/detox-ipv4-server-hook.js${NODE_OPTIONS:+ $NODE_OPTIONS}"

usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/run-android-smoke.sh <app-variant> <release-env> [detox-config]

Supported combinations:
  qa local
  qa qa
  prod prod

Default detox config:
  android.emu.release
EOF
}

if [[ -z "$APP_VARIANT" || -z "$RELEASE_ENV" ]]; then
  usage >&2
  exit 1
fi

case "$APP_VARIANT:$RELEASE_ENV" in
  qa:local|qa:qa|prod:prod)
    ;;
  *)
    echo "Unsupported Android smoke combination: $APP_VARIANT/$RELEASE_ENV" >&2
    usage >&2
    exit 1
    ;;
esac

cd "$ROOT_DIR"

echo "Running Android smoke"
echo "  app variant: $APP_VARIANT"
echo "  release env: $RELEASE_ENV"
echo "  detox config: $DETOX_CONFIG"
echo

bash ./scripts/with-mobile-env.sh "$APP_VARIANT" "$RELEASE_ENV" \
  node ./scripts/verify-mobile-config.js "$APP_VARIANT" "$RELEASE_ENV"

echo

bash ./scripts/with-mobile-env.sh "$APP_VARIANT" "$RELEASE_ENV" \
  bash ./scripts/sync-native-variant.sh "$APP_VARIANT" "$RELEASE_ENV" android

echo

bash ./scripts/with-mobile-env.sh "$APP_VARIANT" "$RELEASE_ENV" \
  detox build -c "$DETOX_CONFIG"

echo

bash ./scripts/with-mobile-env.sh "$APP_VARIANT" "$RELEASE_ENV" \
  env NODE_OPTIONS="$DETOX_NODE_OPTIONS" detox test -c "$DETOX_CONFIG" e2e/quiet-room.response-smoke.test.js --record-logs all --take-screenshots failing
