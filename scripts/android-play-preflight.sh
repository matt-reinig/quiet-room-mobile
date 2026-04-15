#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_JSON="$ROOT_DIR/app.json"
APP_CONFIG_JS="$ROOT_DIR/app.config.js"
APP_BUILD_GRADLE="$ROOT_DIR/android/app/build.gradle"
SIGNING_ENV_FILE="$ROOT_DIR/.env.android.signing"
expected_variant="${1:-}"
expected_release_env="${2:-}"

usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/android-play-preflight.sh <app-variant> <release-env>

Examples:
  bash ./scripts/android-play-preflight.sh qa qa
  bash ./scripts/android-play-preflight.sh prod prod
EOF
}

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

resolve_repo_relative_path() {
  local value="$1"

  if [[ -z "$value" ]]; then
    return 1
  fi

  if [[ "$value" = /* ]]; then
    printf '%s\n' "$value"
    return 0
  fi

  printf '%s/%s\n' "$ROOT_DIR" "$value"
}

if [[ -z "$expected_variant" || -z "$expected_release_env" ]]; then
  usage >&2
  exit 1
fi

load_env_file "$SIGNING_ENV_FILE" >/dev/null 2>&1 || true

echo "Android Play preflight"
echo

if [[ -n "${MOBILE_ENV_BASE_FILE:-}" && -f "${MOBILE_ENV_BASE_FILE}" ]]; then
  pass "Loaded base env: ${MOBILE_ENV_BASE_FILE}"
elif [[ -f "$ROOT_DIR/.env" ]]; then
  pass "Found local .env"
else
  fail "Missing .env. Play-ready builds should point at a deliberate backend target."
fi

if [[ -n "${MOBILE_ENV_OVERLAY_FILE:-}" && -f "${MOBILE_ENV_OVERLAY_FILE}" ]]; then
  pass "Loaded overlay env: ${MOBILE_ENV_OVERLAY_FILE}"
elif [[ "$expected_variant" == "prod" ]]; then
  fail "Missing the prod overlay env file."
else
  warn "Variant overlay env file was not loaded."
fi

if [[ -f "$SIGNING_ENV_FILE" ]]; then
  pass "Found Android signing env: $SIGNING_ENV_FILE"
else
  fail "Missing .env.android.signing. Play release builds need a real upload key."
fi

if verify_output="$(node "$ROOT_DIR/scripts/verify-mobile-config.js" "$expected_variant" "$expected_release_env" 2>&1)"; then
  pass "Resolved app identity and backend match ${expected_variant}/${expected_release_env}"
else
  fail "Resolved app identity or backend does not match ${expected_variant}/${expected_release_env}"
  echo "$verify_output"
fi

app_version="$(node -p "require(process.argv[1]).expo.version" "$APP_JSON")"
app_version_code="$(node -e "const app=require(process.argv[1]); const value=app.expo?.android?.versionCode ?? ''; process.stdout.write(String(value));" "$APP_JSON")"
selected_android_google_services_file="$(node -p "require(process.argv[1]).expo.android?.googleServicesFile ?? ''" "$APP_CONFIG_JS")"

if [[ "$app_version" =~ ^[0-9]+(\.[0-9]+){1,2}$ ]]; then
  pass "Expo version is set: $app_version"
else
  fail "Expo version must look like X.Y or X.Y.Z. Received: $app_version"
fi

if [[ "$app_version_code" =~ ^[0-9]+$ ]] && (( app_version_code > 0 )); then
  pass "Android versionCode is set: $app_version_code"
else
  fail "Android versionCode is missing or invalid in app.json"
fi

if [[ -n "$selected_android_google_services_file" && -f "$ROOT_DIR/$selected_android_google_services_file" ]]; then
  pass "Found selected Android Google services file: $selected_android_google_services_file"
else
  fail "Missing the Android Google services file selected by app.config.js"
fi

if [[ -n "${QUIET_ROOM_ANDROID_UPLOAD_STORE_FILE:-}" ]]; then
  pass "QUIET_ROOM_ANDROID_UPLOAD_STORE_FILE is set"
else
  fail "QUIET_ROOM_ANDROID_UPLOAD_STORE_FILE is missing"
fi

if [[ -n "${QUIET_ROOM_ANDROID_UPLOAD_STORE_PASSWORD:-}" ]]; then
  pass "QUIET_ROOM_ANDROID_UPLOAD_STORE_PASSWORD is set"
else
  fail "QUIET_ROOM_ANDROID_UPLOAD_STORE_PASSWORD is missing"
fi

if [[ -n "${QUIET_ROOM_ANDROID_UPLOAD_KEY_ALIAS:-}" ]]; then
  pass "QUIET_ROOM_ANDROID_UPLOAD_KEY_ALIAS is set"
else
  fail "QUIET_ROOM_ANDROID_UPLOAD_KEY_ALIAS is missing"
fi

if [[ -n "${QUIET_ROOM_ANDROID_UPLOAD_KEY_PASSWORD:-}" ]]; then
  pass "QUIET_ROOM_ANDROID_UPLOAD_KEY_PASSWORD is set"
else
  fail "QUIET_ROOM_ANDROID_UPLOAD_KEY_PASSWORD is missing"
fi

resolved_store_file=""
if [[ -n "${QUIET_ROOM_ANDROID_UPLOAD_STORE_FILE:-}" ]]; then
  resolved_store_file="$(resolve_repo_relative_path "${QUIET_ROOM_ANDROID_UPLOAD_STORE_FILE}")"
fi

if [[ -n "$resolved_store_file" && -f "$resolved_store_file" ]]; then
  pass "Android upload keystore exists: $resolved_store_file"
else
  fail "Android upload keystore file is missing"
fi

if command -v keytool >/dev/null 2>&1; then
  pass "keytool is available for fingerprint export"

  if [[ -n "$resolved_store_file" && -f "$resolved_store_file" ]] \
    && [[ -n "${QUIET_ROOM_ANDROID_UPLOAD_STORE_PASSWORD:-}" ]] \
    && [[ -n "${QUIET_ROOM_ANDROID_UPLOAD_KEY_ALIAS:-}" ]] \
    && [[ -n "${QUIET_ROOM_ANDROID_UPLOAD_KEY_PASSWORD:-}" ]]; then
    if keytool_output="$(
      keytool -list -v \
        -keystore "$resolved_store_file" \
        -alias "$QUIET_ROOM_ANDROID_UPLOAD_KEY_ALIAS" \
        -storepass "$QUIET_ROOM_ANDROID_UPLOAD_STORE_PASSWORD" \
        -keypass "$QUIET_ROOM_ANDROID_UPLOAD_KEY_PASSWORD" 2>/dev/null
    )"; then
      upload_key_sha1="$(printf '%s\n' "$keytool_output" | sed -n 's/^.*SHA1: //p' | head -n 1)"
      upload_key_sha256="$(printf '%s\n' "$keytool_output" | sed -n 's/^.*SHA256: //p' | head -n 1)"

      if [[ -n "$upload_key_sha1" ]]; then
        pass "Upload key SHA1 is readable for Firebase / Google auth alignment"
        echo "       SHA1: $upload_key_sha1"
      else
        fail "keytool ran, but SHA1 could not be read from the upload key"
      fi

      if [[ -n "$upload_key_sha256" ]]; then
        pass "Upload key SHA256 is readable for Play App Signing records"
        echo "       SHA256: $upload_key_sha256"
      fi
    else
      fail "keytool could not read the configured Android upload key"
    fi
  fi
else
  warn "keytool is not available; fingerprint export still needs to be done on a machine with Java"
fi

if [[ -f "$APP_BUILD_GRADLE" ]]; then
  pass "Found generated Android build.gradle"

  if grep -Fq "project.ext.quietRoomHasReleaseSigning ? signingConfigs.release : signingConfigs.debug" "$APP_BUILD_GRADLE"; then
    pass "Generated Android build.gradle includes the env-driven release signing patch"
  else
    fail "Generated Android build.gradle does not include the release signing patch yet"
  fi

  gradle_version_code="$(sed -n "s/.*versionCode \\([0-9][0-9]*\\).*/\\1/p" "$APP_BUILD_GRADLE" | head -n 1)"
  gradle_version_name="$(sed -n 's/.*versionName "\([^"]*\)".*/\1/p' "$APP_BUILD_GRADLE" | head -n 1)"

  if [[ -n "$gradle_version_code" && "$gradle_version_code" == "$app_version_code" ]]; then
    pass "Android versionCode is aligned between app.json and build.gradle"
  else
    fail "Android versionCode is not aligned between app.json and build.gradle"
  fi

  if [[ -n "$gradle_version_name" && "$gradle_version_name" == "$app_version" ]]; then
    pass "Android versionName is aligned between app.json and build.gradle"
  else
    fail "Android versionName is not aligned between app.json and build.gradle"
  fi
else
  warn "android/app/build.gradle is missing; run the native sync flow before building a Play bundle"
fi

echo
echo "Summary"
echo "  pass: $pass_count"
echo "  warn: $warn_count"
echo "  fail: $fail_count"

if (( fail_count > 0 )); then
  echo
  echo "Preflight is not ready for a Play upload yet."
  exit 1
fi

echo
echo "Preflight passed with no blocking failures."
if (( warn_count > 0 )); then
  echo "Warnings remain, but they do not block the next repo-side Android release step."
fi
