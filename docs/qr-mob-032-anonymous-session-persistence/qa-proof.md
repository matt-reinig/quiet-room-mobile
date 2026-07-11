# QR-MOB-032 QA Proof

## Status

Android QA proof passed on 2026-07-10 using the QA release APK built from this
worktree. The flow completed three consecutive process-termination/relaunch
cycles without clearing app data.

The Android run below covers the three consecutive cold-termination/relaunch
cycles without clearing app data. The release UI does not expose raw UID or
conversation IDs, so those values were not captured in the artifact; the
implementation evidence covers UID-scoped storage and authorization, while
the UI proof covers restoration of the existing conversation and messages.

## Executed command

The native QA project was generated in this worktree and the release APK plus
Detox instrumentation APK were built successfully. The passing test command
was:

```sh
ANDROID_SERIAL=emulator-15008 \
E2E_API_BASE=https://6rc3hj3tvyjheia4ilr5svat5i0vdkzm.lambda-url.us-east-1.on.aws \
MOBILE_ENV_BASE_FILE=/Users/mjreinig/projects/Gabriel_App/worktrees/quiet-room-mobile-qr-mob-031-qa-release/.env \
MOBILE_RELEASE_ASSET_ROOT=/Users/mjreinig/projects/Gabriel_App/worktrees/quiet-room-mobile-qr-mob-030-maintenance-audit \
  bash ./scripts/with-mobile-env.sh qa qa \
  npx detox test -c android.att.release \
  e2e/quiet-room.anonymous-continuity.test.js \
  --record-logs all --take-screenshots all --loglevel info
```

Result: `1` test passed on `emulator-15008`; the test case took `91.583s`
(`102.536s` total Jest runtime). The spec title was `restores the newest
guest conversation across three cold relaunches`.

The run began with `launchQuietRoom({ delete: true })`, then retained app data
for all subsequent launches. Each cycle sent a unique marker, terminated the
app, relaunched it, verified the marker text and prior assistant message, and
continued in the same conversation. Passing artifacts:

- [Detox log](../../artifacts/android.att.release.2026-07-11%2000-11-45Z/detox.log)
- [Device log](../../artifacts/android.att.release.2026-07-11%2000-11-45Z/%E2%9C%93%20Quiet%20Room%20anonymous%20continuity%20restores%20the%20newest%20guest%20conversation%20across%20three%20cold%20relaunches/device.log)
- [Start screenshot](../../artifacts/android.att.release.2026-07-11%2000-11-45Z/%E2%9C%93%20Quiet%20Room%20anonymous%20continuity%20restores%20the%20newest%20guest%20conversation%20across%20three%20cold%20relaunches/testStart.png)
- [Completion screenshot](../../artifacts/android.att.release.2026-07-11%2000-11-45Z/%E2%9C%93%20Quiet%20Room%20anonymous%20continuity%20restores%20the%20newest%20guest%20conversation%20across%20three%20cold%20relaunches/testDone.png)
- APK SHA-256: `a9e0f7d54e60f35f1b930a2ce9f1d2c8c8b7c9e3e99db1f061ccefddfcd40ffc`
- Detox test APK SHA-256: `8b7cc8b69a674d58797bd30fbaa3fed99bd1c8aa8702d8c7f54314a56e14b833`

No production data or account deletion was part of this proof.
