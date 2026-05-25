#!/usr/bin/env bash
set -euo pipefail

APP_VARIANT="${APP_VARIANT:-qa}"
BACKEND_ENV="${BACKEND_ENV:-qa}"
DETOX_CONFIG="${1:-${DETOX_CONFIG:-android.att.debug}}"

if [[ $# -gt 0 ]]; then
  shift
fi

if [[ "${LOGIN_SKIP_BUILD:-0}" != "1" ]]; then
  bash ./scripts/with-mobile-env.sh "$APP_VARIANT" "$BACKEND_ENV" \
    npx detox build -c "$DETOX_CONFIG"
fi

bash ./scripts/with-mobile-env.sh "$APP_VARIANT" "$BACKEND_ENV" \
  npx detox test \
    -c "$DETOX_CONFIG" \
    e2e/quiet-room.login-known-account.test.js \
    --record-logs all \
    --take-screenshots failing \
    "$@"
