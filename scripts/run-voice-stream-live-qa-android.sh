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
LONG_REPLY_MODE="${VOICE_QA_LONG_REPLY:-0}"
AUTOPLAY_MODE="${VOICE_QA_AUTOPLAY:-0}"
NATIVE_CAPTURE_MODE="${VOICE_NATIVE_CAPTURE:-0}"
# Android emulator screenrecord caps each invocation at 180 seconds. Run one
# bounded E2E attempt per invocation and repeat this wrapper for three captured
# attempts when the full batch is needed.
LONG_REPLY_ATTEMPTS="${VOICE_QA_LONG_REPLY_ATTEMPTS:-1}"
SETUP_TIMEOUT_MS="${VOICE_QA_SETUP_TIMEOUT_MS:-120000}"
GENERATION_TIMEOUT_MS="${VOICE_QA_GENERATION_TIMEOUT_MS:-240000}"
PLAYBACK_TIMEOUT_MS="${VOICE_QA_PLAYBACK_TIMEOUT_MS:-180000}"
POST_TERMINAL_TIMEOUT_MS="${VOICE_QA_POST_TERMINAL_TIMEOUT_MS:-5000}"
POST_TERMINAL_HOLD_MS="${VOICE_QA_POST_TERMINAL_HOLD_MS:-2000}"
TARGET_SPEECH_MIN_MS="${VOICE_QA_TARGET_SPEECH_MIN_MS:-60000}"
TARGET_SPEECH_MAX_MS="${VOICE_QA_TARGET_SPEECH_MAX_MS:-120000}"
PROXY_PORT="${VOICE_DIAGNOSTIC_PROXY_PORT:-8788}"
PROXY_BASE_URL="${VOICE_DIAGNOSTIC_PROXY_BASE_URL:-http://10.0.2.2:${PROXY_PORT}}"
PROXY_UPSTREAM="${VOICE_QA_TEE_PROXY_UPSTREAM:-${VOICE_QA_UPSTREAM_URL:-}}"
SCREEN_TIME_LIMIT="${VOICE_QA_SCREEN_TIME_LIMIT:-180}"
RUN_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN_DIR="$ROOT_DIR/artifacts/qr-mob-021/live-qa-$RUN_STAMP"
RUN_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DETOX_LOG="$RUN_DIR/detox.log"
SCREENREC_LOG="$RUN_DIR/screenrecord.log"
TEE_PROXY_LOG="$RUN_DIR/tee-proxy.log"
SCREENREC_PATH="$RUN_DIR/emulator.webm"
PLAYBACK_READY_SIGNAL="$RUN_DIR/playback-ready.signal"
RECORDING_STARTED_MARKER="$RUN_DIR/screenrecord.started"
NO_RECORDING_MARKER="$RUN_DIR/no-recording.json"
LIVE_AUTOPLAY_EVIDENCE="$RUN_DIR/live-autoplay-evidence.json"
NATIVE_CAPTURE_DIR="$RUN_DIR/native-capture"
NATIVE_CAPTURE_SUMMARY="$RUN_DIR/native-capture-summary.json"

mkdir -p "$RUN_DIR"

PROXY_CONTEXT_JSON="null"
if [[ "$DIAGNOSTIC_MODE" == "live-proxy" ]]; then
  PROXY_CONTEXT_JSON="\"$PROXY_BASE_URL\""
fi

if [[ "$DIAGNOSTIC_MODE" != "live-trace" && "$DIAGNOSTIC_MODE" != "live-proxy" ]]; then
  echo "VOICE_DIAGNOSTIC_MODE must be live-trace or live-proxy." >&2
  exit 2
fi

if [[ "$LONG_REPLY_MODE" != "0" && "$LONG_REPLY_MODE" != "1" ]]; then
  echo "VOICE_QA_LONG_REPLY must be 0 or 1." >&2
  exit 2
fi

if [[ "$AUTOPLAY_MODE" != "0" && "$AUTOPLAY_MODE" != "1" ]]; then
  echo "VOICE_QA_AUTOPLAY must be 0 or 1." >&2
  exit 2
fi

if [[ "$NATIVE_CAPTURE_MODE" != "0" && "$NATIVE_CAPTURE_MODE" != "1" ]]; then
  echo "VOICE_NATIVE_CAPTURE must be 0 or 1." >&2
  exit 2
fi

if [[ "$NATIVE_CAPTURE_MODE" == "1" && "$DIAGNOSTIC_MODE" != "live-trace" ]]; then
  echo "VOICE_NATIVE_CAPTURE=1 requires VOICE_DIAGNOSTIC_MODE=live-trace." >&2
  exit 2
fi

if [[ "$AUTOPLAY_MODE" == "1" && "$LONG_REPLY_MODE" != "1" ]]; then
  echo "VOICE_QA_AUTOPLAY=1 requires VOICE_QA_LONG_REPLY=1." >&2
  exit 2
fi

if [[ "$AUTOPLAY_MODE" == "1" && "$DIAGNOSTIC_MODE" != "live-trace" ]]; then
  echo "VOICE_QA_AUTOPLAY=1 requires VOICE_DIAGNOSTIC_MODE=live-trace." >&2
  exit 2
fi

if ! [[ "$LONG_REPLY_ATTEMPTS" =~ ^[1-3]$ ]]; then
  echo "VOICE_QA_LONG_REPLY_ATTEMPTS must be between 1 and 3." >&2
  exit 2
fi

if [[ "$LONG_REPLY_MODE" == "1" && "$LONG_REPLY_ATTEMPTS" != "1" ]]; then
  echo "Long-reply capture runs one attempt per invocation; repeat the wrapper for three recordings." >&2
  exit 2
fi

for timeout_value in "$SETUP_TIMEOUT_MS" "$GENERATION_TIMEOUT_MS" "$PLAYBACK_TIMEOUT_MS" "$POST_TERMINAL_TIMEOUT_MS" "$POST_TERMINAL_HOLD_MS" "$TARGET_SPEECH_MIN_MS" "$TARGET_SPEECH_MAX_MS"; do
  if ! [[ "$timeout_value" =~ ^[0-9]+$ ]] || [[ "$timeout_value" -lt 1000 ]]; then
    echo "Long-reply timeout and target values must be integer milliseconds >= 1000." >&2
    exit 2
  fi
done

if [[ "$TARGET_SPEECH_MAX_MS" -lt "$TARGET_SPEECH_MIN_MS" ]]; then
  echo "VOICE_QA_TARGET_SPEECH_MAX_MS must be >= VOICE_QA_TARGET_SPEECH_MIN_MS." >&2
  exit 2
fi

RECORDING_WATCH_TIMEOUT_SEC="${VOICE_QA_RECORDING_WATCH_TIMEOUT_SEC:-$((SETUP_TIMEOUT_MS / 1000 + GENERATION_TIMEOUT_MS / 1000 + 60))}"
if ! [[ "$RECORDING_WATCH_TIMEOUT_SEC" =~ ^[0-9]+$ ]] || [[ "$RECORDING_WATCH_TIMEOUT_SEC" -lt 1 ]] || [[ "$RECORDING_WATCH_TIMEOUT_SEC" -gt 900 ]]; then
  echo "VOICE_QA_RECORDING_WATCH_TIMEOUT_SEC must be an integer between 1 and 900." >&2
  exit 2
fi

if [[ "$LONG_REPLY_MODE" == "1" ]]; then
  # Keep the recording within the Android emulator's 180-second limit.
  SCREEN_TIME_LIMIT="${VOICE_QA_SCREEN_TIME_LIMIT:-180}"
fi

if [[ "$DIAGNOSTIC_MODE" == "live-proxy" && -z "$PROXY_UPSTREAM" ]]; then
  echo "VOICE_QA_TEE_PROXY_UPSTREAM is required for live-proxy mode." >&2
  exit 2
fi

adb_bin="${ADB:-adb}"
tee_proxy_pid=""
recording_watcher_pid=""
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

write_no_recording_marker() {
  local reason="$1"
  cat > "$NO_RECORDING_MARKER" <<EOF
{
  "classification": "no-recording",
  "reason": "$reason",
  "signalPath": "$PLAYBACK_READY_SIGNAL",
  "recordingPath": "$SCREENREC_PATH"
}
EOF
}

start_recording_watcher() {
  (
    local deadline=$(( $(date +%s) + RECORDING_WATCH_TIMEOUT_SEC ))
    while [[ ! -f "$PLAYBACK_READY_SIGNAL" && "$(date +%s)" -lt "$deadline" ]]; do
      sleep 0.2
    done

    if [[ ! -f "$PLAYBACK_READY_SIGNAL" ]]; then
      write_no_recording_marker "playback-ready-signal-timeout"
      exit 0
    fi

    if start_screen_recording; then
      touch "$RECORDING_STARTED_MARKER"
    else
      write_no_recording_marker "screenrecord-start-failed"
    fi
  ) &
  recording_watcher_pid=$!
}

ensure_recording_classification() {
  if [[ "$LONG_REPLY_MODE" == "1" && ! -f "$RECORDING_STARTED_MARKER" && ! -f "$NO_RECORDING_MARKER" ]]; then
    if [[ -f "$PLAYBACK_READY_SIGNAL" ]]; then
      write_no_recording_marker "screenrecord-start-not-observed"
    else
      write_no_recording_marker "playback-ready-signal-not-observed"
    fi
  fi
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

  if [[ -n "$recording_watcher_pid" ]]; then
    kill "$recording_watcher_pid" 2>/dev/null || true
    wait "$recording_watcher_pid" 2>/dev/null || true
  fi
  ensure_recording_classification || true

  if [[ -n "$tee_proxy_pid" ]]; then
    kill "$tee_proxy_pid" 2>/dev/null || true
    wait "$tee_proxy_pid" 2>/dev/null || true
  fi
  if [[ -f "$RECORDING_STARTED_MARKER" ]]; then
    stop_screen_recording || true
  fi

  exit "$status"
}
trap cleanup EXIT INT TERM

cat > "$RUN_DIR/run-context.json" <<EOF
{
  "runStartedAt": "${RUN_STARTED_AT}",
  "detoxConfig": "${DETOX_CONFIG}",
  "avdName": "${DETOX_AVD_NAME}",
  "diagnosticMode": "${DIAGNOSTIC_MODE}",
  "longReplyMode": ${LONG_REPLY_MODE},
  "autoplayMode": ${AUTOPLAY_MODE},
  "nativeCaptureMode": ${NATIVE_CAPTURE_MODE},
  "longReplyAttempts": ${LONG_REPLY_ATTEMPTS},
  "captureScope": "one-attempt-per-invocation",
  "plannedBatchAttempts": 3,
  "screenRecordTimeLimitSeconds": ${SCREEN_TIME_LIMIT},
  "recordingWatchTimeoutSeconds": ${RECORDING_WATCH_TIMEOUT_SEC},
  "timeoutsMs": {
    "setup": ${SETUP_TIMEOUT_MS},
    "generation": ${GENERATION_TIMEOUT_MS},
    "playback": ${PLAYBACK_TIMEOUT_MS},
    "postTerminal": ${POST_TERMINAL_TIMEOUT_MS},
    "postTerminalHold": ${POST_TERMINAL_HOLD_MS}
  },
  "targetSpeechMs": {
    "min": ${TARGET_SPEECH_MIN_MS},
    "max": ${TARGET_SPEECH_MAX_MS}
  },
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
  EXPO_PUBLIC_QR_MOB_021_NATIVE_CAPTURE="$NATIVE_CAPTURE_MODE" \
  ORG_GRADLE_PROJECT_QR_MOB_021_NATIVE_CAPTURE="$NATIVE_CAPTURE_MODE" \
    bash "$ROOT_DIR/scripts/with-mobile-env.sh" qa qa \
    npx detox build -c "$DETOX_CONFIG"
fi

if [[ "$LONG_REPLY_MODE" == "1" ]]; then
  echo "Waiting for playback-ready.signal before starting emulator recording." >&2
  start_recording_watcher
else
  start_screen_recording
  touch "$RECORDING_STARTED_MARKER"
fi

set +e
EXPO_PUBLIC_VOICE_PLAYBACK_ENGINE=track-player \
EXPO_PUBLIC_QR_MOB_021_NATIVE_CAPTURE="$NATIVE_CAPTURE_MODE" \
VOICE_DIAGNOSTIC_MODE="$DIAGNOSTIC_MODE" \
VOICE_DIAGNOSTIC_PROXY_BASE_URL="$PROXY_BASE_URL" \
VOICE_QA_TEE_PROXY_UPSTREAM="$PROXY_UPSTREAM" \
VOICE_QA_LONG_REPLY="$LONG_REPLY_MODE" \
VOICE_QA_AUTOPLAY="$AUTOPLAY_MODE" \
VOICE_QA_LONG_REPLY_ATTEMPTS="$LONG_REPLY_ATTEMPTS" \
VOICE_QA_SETUP_TIMEOUT_MS="$SETUP_TIMEOUT_MS" \
VOICE_QA_GENERATION_TIMEOUT_MS="$GENERATION_TIMEOUT_MS" \
VOICE_QA_PLAYBACK_TIMEOUT_MS="$PLAYBACK_TIMEOUT_MS" \
VOICE_QA_POST_TERMINAL_TIMEOUT_MS="$POST_TERMINAL_TIMEOUT_MS" \
VOICE_QA_POST_TERMINAL_HOLD_MS="$POST_TERMINAL_HOLD_MS" \
VOICE_QA_TARGET_SPEECH_MIN_MS="$TARGET_SPEECH_MIN_MS" \
VOICE_QA_TARGET_SPEECH_MAX_MS="$TARGET_SPEECH_MAX_MS" \
VOICE_QA_EVIDENCE_DIR="$RUN_DIR" \
DETOX_AVD_NAME="$DETOX_AVD_NAME" \
E2E_APP_SCHEME="${E2E_APP_SCHEME:-quietroommobileqa}" \
npx detox test \
  -c "$DETOX_CONFIG" \
  e2e/quiet-room.voice-stream-live-qa.test.js \
  --record-logs all \
  --take-screenshots failing 2>&1 | tee "$DETOX_LOG"
detox_status="${PIPESTATUS[0]}"
set -e

ensure_recording_classification || true

evidence_status="not-requested"
if [[ "$AUTOPLAY_MODE" == "1" ]] && node "$ROOT_DIR/scripts/collect-voice-autoplay-evidence.mjs" \
  --root "$ROOT_DIR" \
  --evidence "$RUN_DIR/long-reply-evidence.json" \
  --output "$LIVE_AUTOPLAY_EVIDENCE" \
  --run-started-at "$RUN_STARTED_AT" \
  --strict; then
  evidence_status="collected"
elif [[ "$AUTOPLAY_MODE" == "1" ]]; then
  evidence_status="collector-failed-or-assertion-failed"
  if [[ "$detox_status" == "0" ]]; then
    detox_status=4
  fi
fi

native_capture_status="not-requested"
if [[ "$NATIVE_CAPTURE_MODE" == "1" && "$AUTOPLAY_MODE" == "1" && "$evidence_status" == "collected" ]]; then
  emulator_serial="$(find_emulator_serial || true)"
  if [[ -n "$emulator_serial" ]] && node "$ROOT_DIR/scripts/collect-native-trackplayer-capture.mjs" \
    --evidence "$LIVE_AUTOPLAY_EVIDENCE" \
    --serial "$emulator_serial" \
    --package com.quietroom.mobile.qa \
    --output-dir "$NATIVE_CAPTURE_DIR" \
    --summary "$NATIVE_CAPTURE_SUMMARY" \
    --expected-endpoint live \
    --strict; then
    native_capture_status="collected"
  else
    native_capture_status="collector-failed-or-assertion-failed"
    if [[ "$detox_status" == "0" ]]; then
      detox_status=5
    fi
  fi
fi

if [[ -f "$RECORDING_STARTED_MARKER" ]]; then
  recording_status="recorded"
elif [[ -f "$NO_RECORDING_MARKER" ]]; then
  recording_status="no-recording"
else
  recording_status="not-started"
fi

cat > "$RUN_DIR/status.txt" <<EOF
detox_status=$detox_status
run_dir=$RUN_DIR
screen_recording=$SCREENREC_PATH
detox_log=$DETOX_LOG
tee_proxy_log=$TEE_PROXY_LOG
long_reply_evidence=$RUN_DIR/long-reply-evidence.json
live_autoplay_evidence=$LIVE_AUTOPLAY_EVIDENCE
live_autoplay_evidence_status=$evidence_status
native_capture_summary=$NATIVE_CAPTURE_SUMMARY
native_capture_status=$native_capture_status
recording_status=$recording_status
recording_ready_signal=$PLAYBACK_READY_SIGNAL
no_recording_marker=$NO_RECORDING_MARKER
EOF

echo "QR-MOB-021 real QA Detox status: $detox_status"
echo "QR-MOB-021 evidence directory: $RUN_DIR"
exit "$detox_status"
