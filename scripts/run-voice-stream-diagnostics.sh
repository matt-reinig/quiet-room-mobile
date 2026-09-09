#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE_PORT="${VOICE_FIXTURE_PORT:-8787}"
FIXTURE_CASE="${VOICE_FIXTURE_CASE:-steady}"
DETOX_CONFIG="${VOICE_DIAGNOSTICS_DETOX_CONFIG:-android.emu.release}"
DETOX_AVD_NAME="${DETOX_AVD_NAME:-Pixel34AVD_2}"
RUN_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RUN_DIR="$ROOT_DIR/artifacts/qr-mob-021/$RUN_STAMP-$FIXTURE_CASE"
SERVER_LOG="$RUN_DIR/fixture-server.log"
RUN_MANIFEST="$RUN_DIR/run-manifest.json"

mkdir -p "$RUN_DIR"
export EXPO_PUBLIC_VOICE_PLAYBACK_ENGINE="track-player"

node "$ROOT_DIR/scripts/verify-mobile-config.js" qa local

if [[ "${VOICE_DIAGNOSTICS_SKIP_SYNC:-0}" != "1" ]]; then
  bash "$ROOT_DIR/scripts/sync-native-variant.sh" qa local
fi

if [[ "${VOICE_DIAGNOSTICS_SKIP_BUILD:-0}" != "1" ]]; then
  npx detox build -c "$DETOX_CONFIG"
fi

node "$ROOT_DIR/scripts/voice-stream-fixture-server.mjs" \
  --host 0.0.0.0 \
  --port "$FIXTURE_PORT" >"$SERVER_LOG" 2>&1 &
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
node "$ROOT_DIR/scripts/collect-voice-stream-run.mjs" \
  --root "$ROOT_DIR" \
  --run-started-at "$RUN_STARTED_AT" \
  --server-log "$SERVER_LOG" \
  --fixture-case "$FIXTURE_CASE" \
  --detox-config "$DETOX_CONFIG" \
  --avd-name "$DETOX_AVD_NAME" \
  --detox-status "$detox_status" \
  --output "$RUN_MANIFEST"
collector_status=$?
set -e

if [[ "$collector_status" -ne 0 ]]; then
  echo "QR-MOB-021 evidence collection failed; preserving Detox exit status $detox_status." >&2
else
  echo "QR-MOB-021 run manifest: $RUN_MANIFEST"
fi

echo "QR-MOB-021 fixture server log: $SERVER_LOG"
exit "$detox_status"
