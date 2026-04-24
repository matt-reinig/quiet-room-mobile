#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_JSON="$ROOT_DIR/app.json"
APP_CONFIG_JS="$ROOT_DIR/app.config.js"
EXPECTED_APP_VARIANT="${1:-${EXPO_PUBLIC_APP_VARIANT:-}}"
EXPECTED_RELEASE_ENV="${2:-${EXPO_PUBLIC_RELEASE_ENV:-}}"
selected_ios_google_services_file="$(node -p "require(process.argv[1]).expo.ios?.googleServicesFile ?? ''" "$APP_CONFIG_JS")"

pass_count=0
warn_count=0
fail_count=0

pass() {
  echo "[pass] $1"
  pass_count=$((pass_count + 1))
}

warn() {
  echo "[warn] $1"
  warn_count=$((warn_count + 1))
}

fail() {
  echo "[fail] $1"
  fail_count=$((fail_count + 1))
}

runtime_has_nonempty_value() {
  local key="$1"
  local value="${!key:-}"
  [[ -n "$value" ]]
}

echo "Internal TestFlight preflight"
echo

if [[ -n "${MOBILE_ENV_BASE_FILE:-}" ]]; then
  pass "Loaded base env file: $MOBILE_ENV_BASE_FILE"
elif [[ -f "$ROOT_DIR/.env" ]]; then
  pass "Found local .env"
else
  fail "Missing .env. The beta build should point at the backend Emily should use."
fi

if [[ -n "${MOBILE_ENV_OVERLAY_FILE:-}" && -f "${MOBILE_ENV_OVERLAY_FILE}" ]]; then
  pass "Loaded overlay env file: $MOBILE_ENV_OVERLAY_FILE"
elif [[ -n "${MOBILE_ENV_OVERLAY_FILE:-}" ]]; then
  fail "Expected overlay env file is missing: $MOBILE_ENV_OVERLAY_FILE"
else
  warn "Overlay env file is unknown; consider running via scripts/with-mobile-env.sh"
fi

if [[ -n "$selected_ios_google_services_file" && -f "$ROOT_DIR/$selected_ios_google_services_file" ]]; then
  pass "Found selected iOS Google services file: $selected_ios_google_services_file"
else
  fail "Missing the iOS Google services file selected by app.config.js"
fi

if runtime_has_nonempty_value "EXPO_PUBLIC_APP_VARIANT"; then
  pass "EXPO_PUBLIC_APP_VARIANT is set"
else
  warn "EXPO_PUBLIC_APP_VARIANT is missing from the current environment; app.config.js will default to prod"
fi

if runtime_has_nonempty_value "EXPO_PUBLIC_RELEASE_ENV"; then
  pass "EXPO_PUBLIC_RELEASE_ENV is set"
else
  warn "EXPO_PUBLIC_RELEASE_ENV is missing from the current environment; runtime config will default to qa"
fi

if runtime_has_nonempty_value "EXPO_PUBLIC_API_BASE"; then
  pass "EXPO_PUBLIC_API_BASE is set"
else
  fail "EXPO_PUBLIC_API_BASE is missing in the current environment"
fi

if runtime_has_nonempty_value "EXPO_PUBLIC_FB_API_KEY"; then
  pass "EXPO_PUBLIC_FB_API_KEY is set"
else
  fail "EXPO_PUBLIC_FB_API_KEY is missing in the current environment"
fi

if runtime_has_nonempty_value "EXPO_PUBLIC_FB_AUTH_DOMAIN"; then
  pass "EXPO_PUBLIC_FB_AUTH_DOMAIN is set"
else
  fail "EXPO_PUBLIC_FB_AUTH_DOMAIN is missing in the current environment"
fi

if runtime_has_nonempty_value "EXPO_PUBLIC_FB_PROJECT_ID"; then
  pass "EXPO_PUBLIC_FB_PROJECT_ID is set"
else
  fail "EXPO_PUBLIC_FB_PROJECT_ID is missing in the current environment"
fi

if runtime_has_nonempty_value "EXPO_PUBLIC_CONTACT_EMAIL"; then
  pass "EXPO_PUBLIC_CONTACT_EMAIL is set"
else
  warn "EXPO_PUBLIC_CONTACT_EMAIL is missing in the current environment"
fi

if runtime_has_nonempty_value "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID"; then
  pass "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is set"
else
  warn "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is missing in the current environment"
fi

if runtime_has_nonempty_value "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID" || runtime_has_nonempty_value "EXPO_PUBLIC_GOOGLE_CLIENT_ID"; then
  pass "A Google web/client id is present for auth token exchange"
else
  warn "Neither EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID nor EXPO_PUBLIC_GOOGLE_CLIENT_ID is set"
fi

app_name="$(node -p "require(process.argv[1]).expo.name" "$APP_CONFIG_JS")"
app_variant="$(node -p "require(process.argv[1]).expo.extra?.appVariant ?? ''" "$APP_CONFIG_JS")"
release_env="$(node -p "require(process.argv[1]).expo.extra?.releaseEnv ?? ''" "$APP_CONFIG_JS")"

if [[ "$app_name" == "quiet-room-mobile" ]]; then
  warn "Visible app name is still quiet-room-mobile"
else
  pass "Visible app name has been updated from the internal placeholder"
fi

if [[ -n "$app_variant" ]]; then
  pass "Resolved app variant: $app_variant"
fi

if [[ -n "$release_env" ]]; then
  pass "Resolved release env: $release_env"
fi

if [[ -n "$EXPECTED_APP_VARIANT" && -n "$EXPECTED_RELEASE_ENV" ]]; then
  echo
  echo "Resolved mobile config"
  if node "$ROOT_DIR/scripts/verify-mobile-config.js" "$EXPECTED_APP_VARIANT" "$EXPECTED_RELEASE_ENV"; then
    pass "Resolved config matches expected $EXPECTED_APP_VARIANT/$EXPECTED_RELEASE_ENV"
  else
    fail "Resolved config does not match expected $EXPECTED_APP_VARIANT/$EXPECTED_RELEASE_ENV"
  fi
else
  warn "Expected app variant/release env were not provided; config mismatch checks were skipped"
fi

echo
echo "iOS metadata"
bash "$ROOT_DIR/scripts/ios-testflight-status.sh" "$EXPECTED_APP_VARIANT" "$EXPECTED_RELEASE_ENV"

echo
echo "Summary"
echo "  pass: $pass_count"
echo "  warn: $warn_count"
echo "  fail: $fail_count"

if (( fail_count > 0 )); then
  echo
  echo "Preflight is not ready for upload yet."
  exit 1
fi

echo
echo "Preflight passed with no blocking failures."
if (( warn_count > 0 )); then
  echo "Warnings remain, but they do not block an internal TestFlight beta."
fi
