#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_VARIANT="${VOICE_DIAGNOSTICS_APP_VARIANT:-qa}"
RELEASE_ENV="${VOICE_DIAGNOSTICS_RELEASE_ENV:-local}"
FIXTURE_PORT="${VOICE_FIXTURE_PORT:-8787}"
FIXTURE_CASE="${VOICE_FIXTURE_CASE:-steady}"
FIXTURE_PATH="${VOICE_FIXTURE_PATH:-}"
FIXTURE_MANIFEST="${VOICE_FIXTURE_MANIFEST:-}"
FIXTURE_EVENTS="${VOICE_FIXTURE_EVENTS:-}"
DETOX_CONFIG="${VOICE_DIAGNOSTICS_DETOX_CONFIG:-android.emu.release}"
DETOX_AVD_NAME="${DETOX_AVD_NAME:-Pixel34AVD_2}"
NATIVE_CAPTURE_MODE="${VOICE_NATIVE_CAPTURE:-0}"
RUN_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RUN_DIR="$ROOT_DIR/artifacts/qr-mob-021/$RUN_STAMP-$FIXTURE_CASE"
SERVER_LOG="$RUN_DIR/fixture-server.log"
RUN_MANIFEST="$RUN_DIR/run-manifest.json"
NATIVE_CAPTURE_DIR="$RUN_DIR/native-capture"
NATIVE_CAPTURE_SUMMARY="$RUN_DIR/native-capture-summary.json"

if [[ "$NATIVE_CAPTURE_MODE" != "0" && "$NATIVE_CAPTURE_MODE" != "1" ]]; then
  echo "VOICE_NATIVE_CAPTURE must be 0 or 1." >&2
  exit 2
fi

mkdir -p "$RUN_DIR"
export EXPO_PUBLIC_VOICE_PLAYBACK_ENGINE="track-player"

node "$ROOT_DIR/scripts/verify-mobile-config.js" "$APP_VARIANT" "$RELEASE_ENV"

if [[ "${VOICE_DIAGNOSTICS_SKIP_SYNC:-0}" != "1" ]]; then
  EXPO_PUBLIC_QR_MOB_021_NATIVE_CAPTURE="$NATIVE_CAPTURE_MODE" \
    bash "$ROOT_DIR/scripts/sync-native-variant.sh" "$APP_VARIANT" "$RELEASE_ENV" android
fi

if [[ "${VOICE_DIAGNOSTICS_SKIP_BUILD:-0}" != "1" ]]; then
  EXPO_PUBLIC_QR_MOB_021_NATIVE_CAPTURE="$NATIVE_CAPTURE_MODE" \
  ORG_GRADLE_PROJECT_QR_MOB_021_NATIVE_CAPTURE="$NATIVE_CAPTURE_MODE" \
    npx detox build -c "$DETOX_CONFIG"
fi

fixture_args=(
  --host 0.0.0.0
  --port "$FIXTURE_PORT"
)
if [[ -n "$FIXTURE_PATH" ]]; then
  fixture_args+=(--fixture "$FIXTURE_PATH")
fi
if [[ -n "$FIXTURE_MANIFEST" ]]; then
  fixture_args+=(--manifest "$FIXTURE_MANIFEST")
fi
if [[ -n "$FIXTURE_EVENTS" ]]; then
  fixture_args+=(--events "$FIXTURE_EVENTS")
fi

node "$ROOT_DIR/scripts/voice-stream-fixture-server.mjs" \
  "${fixture_args[@]}" >"$SERVER_LOG" 2>&1 &
fixture_server_pid=$!

cleanup() {
  kill "$fixture_server_pid" 2>/dev/null || true
  wait "$fixture_server_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for _ in {1..50}; do
  if curl --silent --fail --head \
    "http://127.0.0.1:$FIXTURE_PORT/api/voice_stream?conversation_id=fixture&message_index=0&fixture_case=complete-file" \
    >/dev/null; then
    break
  fi
  sleep 0.1
done

curl --silent --fail --head \
  "http://127.0.0.1:$FIXTURE_PORT/api/voice_stream?conversation_id=fixture&message_index=0&fixture_case=complete-file" \
  >/dev/null

set +e
DETOX_AVD_NAME="$DETOX_AVD_NAME" \
EXPO_PUBLIC_QR_MOB_021_NATIVE_CAPTURE="$NATIVE_CAPTURE_MODE" \
VOICE_FIXTURE_BASE_URL="http://10.0.2.2:$FIXTURE_PORT" \
VOICE_FIXTURE_CASE="$FIXTURE_CASE" \
npx detox test \
  -c "$DETOX_CONFIG" \
  e2e/quiet-room.voice-stream-diagnostics.test.js \
  --record-logs all \
  --take-screenshots failing
detox_status=$?
set -e

set +e
collector_args=(
  --root "$ROOT_DIR"
  --run-started-at "$RUN_STARTED_AT"
  --server-log "$SERVER_LOG"
  --fixture-case "$FIXTURE_CASE"
  --detox-config "$DETOX_CONFIG"
  --avd-name "$DETOX_AVD_NAME"
  --detox-status "$detox_status"
  --output "$RUN_MANIFEST"
)
if [[ -n "$FIXTURE_MANIFEST" ]]; then
  collector_args+=(--fixture-manifest "$FIXTURE_MANIFEST")
fi
if [[ -n "$FIXTURE_PATH" ]]; then
  collector_args+=(--fixture-path "$FIXTURE_PATH")
fi
node "$ROOT_DIR/scripts/collect-voice-stream-run.mjs" "${collector_args[@]}"
collector_status=$?
set -e

if [[ "$collector_status" -ne 0 ]]; then
  echo "QR-MOB-021 evidence collection failed; preserving Detox exit status $detox_status." >&2
else
  echo "QR-MOB-021 run manifest: $RUN_MANIFEST"
fi

native_capture_status="not-requested"
if [[ "$NATIVE_CAPTURE_MODE" == "1" && "$collector_status" == "0" ]]; then
  emulator_serial="${ANDROID_SERIAL:-$(adb devices | awk '$1 ~ /^emulator-[0-9]+$/ && $2 == "device" { print $1; exit }')}"
  expected_capture_sha="$(node -e 'const fs=require("fs"); const value=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(value.fixture.sha256)' "$RUN_MANIFEST")"
  if [[ -n "$emulator_serial" ]] && node "$ROOT_DIR/scripts/collect-native-trackplayer-capture.mjs" \
    --evidence "$RUN_MANIFEST" \
    --serial "$emulator_serial" \
    --package com.quietroom.mobile.qa \
    --output-dir "$NATIVE_CAPTURE_DIR" \
    --summary "$NATIVE_CAPTURE_SUMMARY" \
    --expected-endpoint fixture \
    --expected-sha256 "$expected_capture_sha" \
    --strict; then
    native_capture_status="collected"
  else
    native_capture_status="collector-failed-or-assertion-failed"
    if [[ "$detox_status" == "0" ]]; then
      detox_status=4
    fi
  fi
fi

echo "QR-MOB-021 fixture server log: $SERVER_LOG"
echo "QR-MOB-021 native capture status: $native_capture_status"
echo "QR-MOB-021 native capture summary: $NATIVE_CAPTURE_SUMMARY"
exit "$detox_status"
