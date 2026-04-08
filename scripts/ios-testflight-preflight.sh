#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
IOS_GOOGLE_SERVICES_FILE="$ROOT_DIR/GoogleService-Info.plist"
APP_JSON="$ROOT_DIR/app.json"

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

env_has_nonempty_value() {
  local key="$1"

  if [[ ! -f "$ENV_FILE" ]]; then
    return 1
  fi

  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"

  if [[ -z "$line" ]]; then
    return 1
  fi

  local value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"

  [[ -n "$value" ]]
}

echo "Internal TestFlight preflight"
echo

if [[ -f "$ENV_FILE" ]]; then
  pass "Found local .env"
else
  fail "Missing .env. The beta build should point at the backend Emily should use."
fi

if [[ -f "$IOS_GOOGLE_SERVICES_FILE" ]]; then
  pass "Found GoogleService-Info.plist"
else
  fail "Missing GoogleService-Info.plist"
fi

if env_has_nonempty_value "EXPO_PUBLIC_API_BASE"; then
  pass "EXPO_PUBLIC_API_BASE is set"
else
  fail "EXPO_PUBLIC_API_BASE is missing in .env"
fi

if env_has_nonempty_value "EXPO_PUBLIC_FB_API_KEY"; then
  pass "EXPO_PUBLIC_FB_API_KEY is set"
else
  fail "EXPO_PUBLIC_FB_API_KEY is missing in .env"
fi

if env_has_nonempty_value "EXPO_PUBLIC_FB_AUTH_DOMAIN"; then
  pass "EXPO_PUBLIC_FB_AUTH_DOMAIN is set"
else
  fail "EXPO_PUBLIC_FB_AUTH_DOMAIN is missing in .env"
fi

if env_has_nonempty_value "EXPO_PUBLIC_FB_PROJECT_ID"; then
  pass "EXPO_PUBLIC_FB_PROJECT_ID is set"
else
  fail "EXPO_PUBLIC_FB_PROJECT_ID is missing in .env"
fi

if env_has_nonempty_value "EXPO_PUBLIC_CONTACT_EMAIL"; then
  pass "EXPO_PUBLIC_CONTACT_EMAIL is set"
else
  warn "EXPO_PUBLIC_CONTACT_EMAIL is missing in .env"
fi

if env_has_nonempty_value "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID"; then
  pass "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is set"
else
  warn "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is missing in .env"
fi

if env_has_nonempty_value "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID" || env_has_nonempty_value "EXPO_PUBLIC_GOOGLE_CLIENT_ID"; then
  pass "A Google web/client id is present for auth token exchange"
else
  warn "Neither EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID nor EXPO_PUBLIC_GOOGLE_CLIENT_ID is set"
fi

app_name="$(node -p "require(process.argv[1]).expo.name" "$APP_JSON")"

if [[ "$app_name" == "quiet-room-mobile" ]]; then
  warn "Visible app name is still quiet-room-mobile"
else
  pass "Visible app name has been updated from the internal placeholder"
fi

echo
echo "iOS metadata"
bash "$ROOT_DIR/scripts/ios-testflight-status.sh"

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
