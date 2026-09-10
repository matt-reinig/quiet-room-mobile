#!/usr/bin/env bash

set -euo pipefail

# Runs one real authenticated QA saved-message voice request on an Android
# emulator. The app itself owns the authenticated GET; in live-proxy mode the
# configured local tee must forward that GET without changing its credentials.
# The tee and structured diagnostics never print the prompt, assistant content,
# or Authorization header. Detox's raw test log can include the synthetic prompt
# and must remain an ignored local artifact.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DETOX_CONFIG="${VOICE_QA_DETOX_CONFIG:-android.emu.release}"
DETOX_AVD_NAME="${DETOX_AVD_NAME:-Pixel34AVD_2}"
DIAGNOSTIC_MODE="${VOICE_DIAGNOSTIC_MODE:-live-trace}"
PROXY_PORT="${VOICE_DIAGNOSTIC_PROXY_PORT:-8788}"
PROXY_BASE_URL="${VOICE_DIAGNOSTIC_PROXY_BASE_URL:-http://10.0.2.2:${PROXY_PORT}}"
PROXY_UPSTREAM="${VOICE_QA_TEE_PROXY_UPSTREAM:-${VOICE_QA_UPSTREAM_URL:-}}"
SCREEN_TIME_LIMIT="${VOICE_QA_SCREEN_TIME_LIMIT:-180}"
RUN_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_DIR="$ROOT_DIR/artifacts/qr-mob-021/live-qa-$RUN_STAMP"
DETOX_LOG="$RUN_DIR/detox.log"
SCREENREC_LOG="$RUN_DIR/screenrecord.log"
TEE_PROXY_LOG="$RUN_DIR/tee-proxy.log"
SCREENREC_PATH="$RUN_DIR/emulator.webm"

mkdir -p "$RUN_DIR"

PROXY_CONTEXT_JSON="null"
if [[ "$DIAGNOSTIC_MODE" == "live-proxy" ]]; then
  PROXY_CONTEXT_JSON="\"$PROXY_BASE_URL\""
fi

if [[ "$DIAGNOSTIC_MODE" != "live-trace" && "$DIAGNOSTIC_MODE" != "live-proxy" ]]; then
  echo "VOICE_DIAGNOSTIC_MODE must be live-trace or live-proxy." >&2
  exit 2
fi

if [[ "$DIAGNOSTIC_MODE" == "live-proxy" && -z "$PROXY_UPSTREAM" ]]; then
  echo "VOICE_QA_TEE_PROXY_UPSTREAM is required for live-proxy mode." >&2
  exit 2
fi

adb_bin="${ADB:-adb}"
tee_proxy_pid=""
detox_status=1

find_emulator_serial() {
  if [[ -n "${ANDROID_SERIAL:-}" ]]; then
    printf '%s\n' "$ANDROID_SERIAL"
    return 0
  fi

  "$adb_bin" devices | awk '$1 ~ /^emulator-[0-9]+$/ && $2 == "device" { print $1; exit }'
}

start_screen_recording() {
  local serial=""
  serial="$(find_emulator_serial || true)"
  if [[ -z "$serial" ]]; then
    echo "No running Android emulator is available for audio capture." >&2
    return 1
  fi
  echo "Starting emulator screen/audio recording on $serial" >&2
  "$adb_bin" -s "$serial" emu screenrecord start \
    --time-limit "$SCREEN_TIME_LIMIT" \
    "$SCREENREC_PATH" >"$SCREENREC_LOG" 2>&1
}

stop_screen_recording() {
  local serial=""
  serial="$(find_emulator_serial || true)"
  if [[ -n "$serial" ]]; then
    "$adb_bin" -s "$serial" emu screenrecord stop >>"$SCREENREC_LOG" 2>&1 || true
  fi
}

cleanup() {
  local status=$?

  if [[ -n "$tee_proxy_pid" ]]; then
    kill "$tee_proxy_pid" 2>/dev/null || true
    wait "$tee_proxy_pid" 2>/dev/null || true
  fi
  stop_screen_recording || true

  exit "$status"
}
trap cleanup EXIT INT TERM

cat > "$RUN_DIR/run-context.json" <<EOF
{
  "runStartedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "detoxConfig": "${DETOX_CONFIG}",
  "avdName": "${DETOX_AVD_NAME}",
  "diagnosticMode": "${DIAGNOSTIC_MODE}",
  "proxyBaseUrl": $PROXY_CONTEXT_JSON,
  "trackPlayer": true,
  "qaAppVariant": true,
  "qaReleaseEnv": true
}
EOF

if [[ "$DIAGNOSTIC_MODE" == "live-proxy" ]]; then
  echo "Starting QA tee proxy on ${PROXY_BASE_URL}; upstream is configured." >&2
  mkdir -p "$RUN_DIR/tee"
  node "$ROOT_DIR/scripts/voice-stream-tee-proxy.mjs" \
    --upstream "$PROXY_UPSTREAM" \
    --host 0.0.0.0 \
    --port "$PROXY_PORT" \
    --output-dir "$RUN_DIR/tee" >"$TEE_PROXY_LOG" 2>&1 &
  tee_proxy_pid=$!
  tee_ready=0
  for _ in {1..100}; do
    if grep -q "voice tee listening" "$TEE_PROXY_LOG" 2>/dev/null; then
      tee_ready=1
      break
    fi
    if ! kill -0 "$tee_proxy_pid" 2>/dev/null; then
      break
    fi
    sleep 0.1
  done
  if [[ "$tee_ready" != "1" ]]; then
    echo "QA tee proxy did not become ready; inspect $TEE_PROXY_LOG." >&2
    exit 3
  fi
fi

if [[ "${VOICE_QA_SKIP_BUILD:-0}" != "1" ]]; then
  EXPO_PUBLIC_VOICE_PLAYBACK_ENGINE=track-player \
    bash "$ROOT_DIR/scripts/with-mobile-env.sh" qa qa \
    npx detox build -c "$DETOX_CONFIG"
fi

start_screen_recording

set +e
EXPO_PUBLIC_VOICE_PLAYBACK_ENGINE=track-player \
VOICE_DIAGNOSTIC_MODE="$DIAGNOSTIC_MODE" \
VOICE_DIAGNOSTIC_PROXY_BASE_URL="$PROXY_BASE_URL" \
VOICE_QA_TEE_PROXY_UPSTREAM="$PROXY_UPSTREAM" \
DETOX_AVD_NAME="$DETOX_AVD_NAME" \
E2E_APP_SCHEME="${E2E_APP_SCHEME:-quietroommobileqa}" \
npx detox test \
  -c "$DETOX_CONFIG" \
  e2e/quiet-room.voice-stream-live-qa.test.js \
  --record-logs all \
  --take-screenshots failing 2>&1 | tee "$DETOX_LOG"
detox_status="${PIPESTATUS[0]}"
set -e

cat > "$RUN_DIR/status.txt" <<EOF
detox_status=$detox_status
run_dir=$RUN_DIR
screen_recording=$SCREENREC_PATH
detox_log=$DETOX_LOG
tee_proxy_log=$TEE_PROXY_LOG
EOF

echo "QR-MOB-021 real QA Detox status: $detox_status"
echo "QR-MOB-021 evidence directory: $RUN_DIR"
exit "$detox_status"
