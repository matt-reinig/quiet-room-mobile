#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_JSON="$ROOT_DIR/app.json"
APP_CONFIG_JS="$ROOT_DIR/app.config.js"
ANDROID_DIR="$ROOT_DIR/android"
APP_BUILD_GRADLE="$ANDROID_DIR/app/build.gradle"
SIGNING_ENV_FILE="$ROOT_DIR/.env.android.signing"

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

if [[ ! -f "$APP_JSON" || ! -f "$APP_CONFIG_JS" ]]; then
  echo "Missing app config files at $ROOT_DIR" >&2
  exit 1
fi

load_env_file "$SIGNING_ENV_FILE" >/dev/null 2>&1 || true

app_name="$(node -p "require(process.argv[1]).expo.name" "$APP_CONFIG_JS")"
app_slug="$(node -p "require(process.argv[1]).expo.slug" "$APP_CONFIG_JS")"
app_version="$(node -p "require(process.argv[1]).expo.version" "$APP_JSON")"
app_version_code="$(node -e "const app=require(process.argv[1]); const value=app.expo?.android?.versionCode ?? ''; process.stdout.write(String(value));" "$APP_JSON")"
app_package="$(node -p "require(process.argv[1]).expo.android.package" "$APP_CONFIG_JS")"
app_scheme="$(node -p "require(process.argv[1]).expo.scheme" "$APP_CONFIG_JS")"
app_variant="$(node -p "require(process.argv[1]).expo.extra?.appVariant ?? ''" "$APP_CONFIG_JS")"
release_env="$(node -p "require(process.argv[1]).expo.extra?.releaseEnv ?? ''" "$APP_CONFIG_JS")"
selected_android_google_services_file="$(node -p "require(process.argv[1]).expo.android?.googleServicesFile ?? ''" "$APP_CONFIG_JS")"

gradle_namespace=""
gradle_application_id=""
gradle_version_code=""
gradle_version_name=""
gradle_release_signing_mode=""

if [[ -f "$APP_BUILD_GRADLE" ]]; then
  gradle_namespace="$(sed -n "s/.*namespace '\\([^']*\\)'.*/\\1/p" "$APP_BUILD_GRADLE" | head -n 1)"
  gradle_application_id="$(sed -n "s/.*applicationId '\\([^']*\\)'.*/\\1/p" "$APP_BUILD_GRADLE" | head -n 1)"
  gradle_version_code="$(sed -n "s/.*versionCode \\([0-9][0-9]*\\).*/\\1/p" "$APP_BUILD_GRADLE" | head -n 1)"
  gradle_version_name="$(sed -n 's/.*versionName "\([^"]*\)".*/\1/p' "$APP_BUILD_GRADLE" | head -n 1)"

  if grep -Fq "project.ext.quietRoomHasReleaseSigning ? signingConfigs.release : signingConfigs.debug" "$APP_BUILD_GRADLE"; then
    gradle_release_signing_mode="env-driven upload key with debug fallback"
  else
    gradle_release_signing_mode="debug fallback only"
  fi
fi

resolved_store_file=""
if [[ -n "${QUIET_ROOM_ANDROID_UPLOAD_STORE_FILE:-}" ]]; then
  resolved_store_file="$(resolve_repo_relative_path "${QUIET_ROOM_ANDROID_UPLOAD_STORE_FILE}")"
fi

upload_key_sha1=""
upload_key_sha256=""
if command -v keytool >/dev/null 2>&1 \
  && [[ -n "${resolved_store_file:-}" ]] \
  && [[ -f "$resolved_store_file" ]] \
  && [[ -n "${QUIET_ROOM_ANDROID_UPLOAD_STORE_PASSWORD:-}" ]] \
  && [[ -n "${QUIET_ROOM_ANDROID_UPLOAD_KEY_ALIAS:-}" ]] \
  && [[ -n "${QUIET_ROOM_ANDROID_UPLOAD_KEY_PASSWORD:-}" ]]; then
  keytool_output="$(
    keytool -list -v \
      -keystore "$resolved_store_file" \
      -alias "$QUIET_ROOM_ANDROID_UPLOAD_KEY_ALIAS" \
      -storepass "$QUIET_ROOM_ANDROID_UPLOAD_STORE_PASSWORD" \
      -keypass "$QUIET_ROOM_ANDROID_UPLOAD_KEY_PASSWORD" 2>/dev/null || true
  )"
  upload_key_sha1="$(printf '%s\n' "$keytool_output" | sed -n 's/^.*SHA1: //p' | head -n 1)"
  upload_key_sha256="$(printf '%s\n' "$keytool_output" | sed -n 's/^.*SHA256: //p' | head -n 1)"
fi

echo "Expo config"
echo "  name: $app_name"
echo "  slug: $app_slug"
echo "  version: $app_version"
echo "  android.versionCode: ${app_version_code:-<unset>}"
echo "  scheme: $app_scheme"
echo "  extra.appVariant: ${app_variant:-<unset>}"
echo "  extra.releaseEnv: ${release_env:-<unset>}"
echo "  android.package: $app_package"
echo "  android.googleServicesFile: ${selected_android_google_services_file:-<unset>}"
echo

echo "Android signing env"
echo "  file: ${MOBILE_ANDROID_SIGNING_ENV_FILE:-$SIGNING_ENV_FILE}"
echo "  QUIET_ROOM_ANDROID_UPLOAD_STORE_FILE: ${QUIET_ROOM_ANDROID_UPLOAD_STORE_FILE:-<unset>}"
echo "  resolved upload keystore: ${resolved_store_file:-<unset>}"
echo "  QUIET_ROOM_ANDROID_UPLOAD_KEY_ALIAS: ${QUIET_ROOM_ANDROID_UPLOAD_KEY_ALIAS:-<unset>}"
if [[ -n "${resolved_store_file:-}" && -f "$resolved_store_file" ]]; then
  echo "  keystore exists: yes"
else
  echo "  keystore exists: no"
fi
if [[ -n "$upload_key_sha1" ]]; then
  echo "  upload key SHA1: $upload_key_sha1"
fi
if [[ -n "$upload_key_sha256" ]]; then
  echo "  upload key SHA256: $upload_key_sha256"
fi
echo

if [[ -f "$APP_BUILD_GRADLE" ]]; then
  echo "Native Android config"
  echo "  build.gradle: ${APP_BUILD_GRADLE#$ROOT_DIR/}"
  echo "  namespace: ${gradle_namespace:-<unset>}"
  echo "  applicationId: ${gradle_application_id:-<unset>}"
  echo "  versionCode: ${gradle_version_code:-<unset>}"
  echo "  versionName: ${gradle_version_name:-<unset>}"
  echo "  release signing mode: ${gradle_release_signing_mode:-<unset>}"
else
  echo "Native Android config"
  echo "  build.gradle: <missing>"
  echo "  run native sync before building a Play bundle:"
  echo "    npm run native:sync:${app_variant:-qa}"
fi
echo

if [[ -z "$app_version_code" ]]; then
  echo "Warning: app.json does not currently set expo.android.versionCode."
fi

if [[ -f "$APP_BUILD_GRADLE" ]]; then
  if [[ -n "$gradle_version_code" && -n "$app_version_code" && "$gradle_version_code" != "$app_version_code" ]]; then
    echo "Warning: Android versionCode is not aligned between app.json and build.gradle."
  fi

  if [[ -n "$gradle_version_name" && "$gradle_version_name" != "$app_version" ]]; then
    echo "Warning: Android versionName is not aligned between app.json and build.gradle."
  fi
fi
