#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_VARIANT="${1:-qa}"
RELEASE_ENV="${2:-local}"
DETOX_CONFIG="${3:-${DETOX_ANDROID_CONFIG:-android.emu.release}}"
DETOX_NODE_OPTIONS="--require $ROOT_DIR/scripts/detox-ipv4-server-hook.js${NODE_OPTIONS:+ $NODE_OPTIONS}"
BACKEND_ROOT_DEFAULT="$(cd "$ROOT_DIR/../Gabriel" 2>/dev/null && pwd || true)"
BACKEND_ROOT="${GABRIEL_BACKEND_ROOT:-$BACKEND_ROOT_DEFAULT}"
BACKEND_PORT_FILE="${GABRIEL_BACKEND_PORT_FILE:-${BACKEND_ROOT:+$BACKEND_ROOT/.gabriel-port}}"
LOCAL_BACKEND_PORT="${LOCAL_BACKEND_PORT:-}"
LOCAL_ANDROID_API_BASE="${LOCAL_ANDROID_API_BASE:-}"
LOCAL_HOST_API_BASE="${LOCAL_HOST_API_BASE:-}"
LOCAL_ANDROID_AUTH_EMULATOR_HOST="${LOCAL_ANDROID_AUTH_EMULATOR_HOST:-10.0.2.2:9099}"
LOCAL_TEST_KEY="${E2E_TEST_KEY:-${GABRIEL_TEST_KEY:-gabriel-local-test-key}}"

usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/run-android-account-deletion.sh [app-variant] [release-env] [detox-config]

Defaults:
  app-variant: qa
  release-env: local
  detox-config: android.emu.release

Supported combinations:
  qa local
  qa qa
EOF
}

case "$APP_VARIANT:$RELEASE_ENV" in
  qa:local|qa:qa)
    ;;
  *)
    echo "Unsupported account deletion combination: $APP_VARIANT/$RELEASE_ENV" >&2
    usage >&2
    exit 1
    ;;
esac

if [[ "$RELEASE_ENV" == "local" ]]; then
  if [[ -z "$LOCAL_BACKEND_PORT" && -n "$BACKEND_PORT_FILE" && -f "$BACKEND_PORT_FILE" ]]; then
    LOCAL_BACKEND_PORT="$(tr -d '[:space:]' < "$BACKEND_PORT_FILE")"
  fi

  if [[ -z "$LOCAL_BACKEND_PORT" ]]; then
    LOCAL_BACKEND_PORT=5000
  fi

  if [[ -z "$LOCAL_ANDROID_API_BASE" ]]; then
    LOCAL_ANDROID_API_BASE="http://10.0.2.2:${LOCAL_BACKEND_PORT}"
  fi

  if [[ -z "$LOCAL_HOST_API_BASE" ]]; then
    LOCAL_HOST_API_BASE="http://127.0.0.1:${LOCAL_BACKEND_PORT}"
  fi
fi

run_with_mobile_env() {
  local env_args=()

  if [[ "$RELEASE_ENV" == "local" ]]; then
    env_args+=(
      "EXPO_PUBLIC_API_BASE=$LOCAL_ANDROID_API_BASE"
      "E2E_API_BASE=$LOCAL_HOST_API_BASE"
      "EXPO_PUBLIC_FB_AUTH_EMULATOR_HOST=$LOCAL_ANDROID_AUTH_EMULATOR_HOST"
      "E2E_TEST_KEY=$LOCAL_TEST_KEY"
    )
  fi

  bash ./scripts/with-mobile-env.sh "$APP_VARIANT" "$RELEASE_ENV" env "${env_args[@]}" "$@"
}

cd "$ROOT_DIR"

echo "Running Android account deletion"
echo "  app variant: $APP_VARIANT"
echo "  release env: $RELEASE_ENV"
echo "  detox config: $DETOX_CONFIG"
if [[ "$RELEASE_ENV" == "local" ]]; then
  echo "  local api base: $LOCAL_ANDROID_API_BASE"
  echo "  host api base: $LOCAL_HOST_API_BASE"
  echo "  auth emulator: $LOCAL_ANDROID_AUTH_EMULATOR_HOST"
fi
echo

run_with_mobile_env node ./scripts/verify-mobile-config.js "$APP_VARIANT" "$RELEASE_ENV"

echo

run_with_mobile_env bash ./scripts/sync-native-variant.sh "$APP_VARIANT" "$RELEASE_ENV" android

echo

run_with_mobile_env npx detox build -c "$DETOX_CONFIG"

echo

run_with_mobile_env env NODE_OPTIONS="$DETOX_NODE_OPTIONS" npx detox test -c "$DETOX_CONFIG" e2e/quiet-room.account-deletion.test.js --record-logs all --take-screenshots failing
