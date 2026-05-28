#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_VARIANT="${1:-}"
RELEASE_ENV="${2:-}"

usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/with-mobile-env.sh <app-variant> <release-env> <command...>

Examples:
  bash ./scripts/with-mobile-env.sh qa qa node ./scripts/print-mobile-config.js
  bash ./scripts/with-mobile-env.sh qa local npm run native:sync:local-qa
  bash ./scripts/with-mobile-env.sh prod prod node ./scripts/verify-mobile-config.js prod prod
EOF
}

if [[ -z "$APP_VARIANT" || -z "$RELEASE_ENV" || $# -lt 3 ]]; then
  usage >&2
  exit 1
fi

shift 2

case "$APP_VARIANT:$RELEASE_ENV" in
  qa:local)
    OVERLAY_ENV_FILE="$ROOT_DIR/.env.local.qa"
    ;;
  qa:qa)
    OVERLAY_ENV_FILE="$ROOT_DIR/.env.qa"
    ;;
  prod:prod)
    OVERLAY_ENV_FILE="$ROOT_DIR/.env.prod"
    ;;
  *)
    echo "Unsupported app-variant/release-env combination: $APP_VARIANT/$RELEASE_ENV" >&2
    echo "Supported combinations: qa/local, qa/qa, prod/prod" >&2
    exit 1
    ;;
esac

BASE_ENV_FILE="$ROOT_DIR/.env"
ANDROID_SIGNING_ENV_FILE="$ROOT_DIR/.env.android.signing"

load_env_file() {
  local file_path="$1"

  if [[ ! -f "$file_path" ]]; then
    return 1
  fi

  set -a
  # shellcheck source=/dev/null
  source "$file_path"
  set +a
  return 0
}

loaded_any_env=false
loaded_android_signing_env=false

if load_env_file "$BASE_ENV_FILE"; then
  loaded_any_env=true
fi

if [[ -f "$OVERLAY_ENV_FILE" ]]; then
  load_env_file "$OVERLAY_ENV_FILE"
  loaded_any_env=true
elif [[ "$APP_VARIANT" == "prod" ]]; then
  echo "Missing required env file: $OVERLAY_ENV_FILE" >&2
  exit 1
fi

if [[ "$RELEASE_ENV" != "local" ]]; then
  unset EXPO_PUBLIC_FB_AUTH_EMULATOR_HOST
fi

if load_env_file "$ANDROID_SIGNING_ENV_FILE"; then
  loaded_android_signing_env=true
fi

if [[ "$loaded_any_env" != true ]]; then
  echo "No mobile env file could be loaded. Expected at least $BASE_ENV_FILE" >&2
  exit 1
fi

export EXPO_PUBLIC_APP_VARIANT="$APP_VARIANT"
export EXPO_PUBLIC_RELEASE_ENV="$RELEASE_ENV"
export EXPO_NO_DOTENV=1
export MOBILE_ENV_BASE_FILE="$BASE_ENV_FILE"
export MOBILE_ENV_OVERLAY_FILE="$OVERLAY_ENV_FILE"
export MOBILE_ANDROID_SIGNING_ENV_FILE="$ANDROID_SIGNING_ENV_FILE"

echo "Running with mobile env" >&2
echo "  app variant: $APP_VARIANT" >&2
echo "  release env: $RELEASE_ENV" >&2
echo "  base env: $BASE_ENV_FILE" >&2
if [[ -f "$OVERLAY_ENV_FILE" ]]; then
  echo "  overlay env: $OVERLAY_ENV_FILE" >&2
else
  echo "  overlay env: <missing, using base env only>" >&2
fi
if [[ "$loaded_android_signing_env" == true ]]; then
  echo "  android signing env: $ANDROID_SIGNING_ENV_FILE" >&2
else
  echo "  android signing env: <missing, release signing vars not loaded>" >&2
fi
echo >&2

cd "$ROOT_DIR"
exec "$@"
