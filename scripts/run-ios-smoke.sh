#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_VARIANT="${1:-}"
RELEASE_ENV="${2:-}"
DETOX_CONFIG="${3:-${DETOX_IOS_CONFIG:-ios.sim.release}}"

usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/run-ios-smoke.sh <app-variant> <release-env> [detox-config]

Supported combinations:
  qa qa
  prod prod

Default detox config:
  ios.sim.release
EOF
}

if [[ -z "$APP_VARIANT" || -z "$RELEASE_ENV" ]]; then
  usage >&2
  exit 1
fi

case "$APP_VARIANT:$RELEASE_ENV" in
  qa:qa|prod:prod)
    ;;
  *)
    echo "Unsupported iOS smoke combination: $APP_VARIANT/$RELEASE_ENV" >&2
    usage >&2
    exit 1
    ;;
esac

cd "$ROOT_DIR"

echo "Running iOS smoke"
echo "  app variant: $APP_VARIANT"
echo "  release env: $RELEASE_ENV"
echo "  detox config: $DETOX_CONFIG"
echo

bash ./scripts/with-mobile-env.sh "$APP_VARIANT" "$RELEASE_ENV" \
  node ./scripts/verify-mobile-config.js "$APP_VARIANT" "$RELEASE_ENV"

echo

bash ./scripts/with-mobile-env.sh "$APP_VARIANT" "$RELEASE_ENV" \
  bash ./scripts/sync-native-variant.sh "$APP_VARIANT" "$RELEASE_ENV" ios

echo

bash ./scripts/with-mobile-env.sh "$APP_VARIANT" "$RELEASE_ENV" \
  detox build -c "$DETOX_CONFIG"

echo

bash ./scripts/with-mobile-env.sh "$APP_VARIANT" "$RELEASE_ENV" \
  detox test -c "$DETOX_CONFIG" e2e/quiet-room.response-smoke.test.js --record-logs all --take-screenshots failing
