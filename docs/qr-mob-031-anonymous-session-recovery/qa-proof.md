# QR-MOB-031 QA proof

Validated on 2026-07-10 against the QA mobile app and Firebase project
`gabriel-qa-89f20`.

## Scope boundary

This is the mobile recovery proof for QR-MOB-031. It used the guarded backend
anonymous-retention endpoint only to delete one explicitly targeted disposable
UID. It was not a full QA anonymous-account cleanup run and does not close or
replace the separate cleanup operation.

## Accepted QA builds

- Android Play internal: `QA internal 27`, `versionCode 27`, completed release,
  Play edit `00865906406101853378`, AAB SHA256
  `71443ca24786755344e42102c130515da07c5af2485a8fce1e86f44368191d6d`.
- iOS App Store Connect / TestFlight: QuietRoomQA build `34`. The signed archive
  passed entitlement verification, and the App Store Connect API-key fallback
  reported `Uploaded package is processing`, `Upload succeeded`,
  `Uploaded QuietRoomQA`, and `** EXPORT SUCCEEDED **`.
- Final mobile source: `d16b083` on `develop`.

## Controlled running-app proof

1. Installed the release APK built from the same `versionCode 27` source,
   cleared only `com.quietroom.mobile.qa`, and launched it on the QA emulator.
2. The clean launch created exactly one anonymous UID:
   `uIau3v0FpSYy8kclNgy7xbvjzU73`.
3. Sent `qr-mob-031-v27-predelete-proof`; the QA conversation stored the marker
   and returned a visible assistant response.
4. Re-imported that disposable UID with a 31-day-old Auth creation timestamp so
   the real 30-day endpoint guard remained unchanged. Its marker and conversation
   data remained present before deletion.
5. Called the guarded QA endpoint with `targetUid` and `maxUsers: 1`:
   - dry run: `authUsersScanned=1`, `candidates=1`, `deleted=0`, `errors=0`;
   - apply: `authUsersScanned=1`, `candidates=1`, `deleted=1`, `errors=0`.
6. The QA app process stayed `28295` before and after deletion.
7. Returned to that same running process and sent
   `qr-mob-031-v27-postdelete-proof`.
8. Recovery created exactly one replacement anonymous UID:
   `qC3pEw5wgCTp9fFDVX0XEt4TpQn1`. The old UID no longer existed in Auth and had
   zero conversations. The replacement had one fresh conversation containing
   exactly a user message and assistant message; the post-delete marker and a
   non-empty assistant response were both present. The same message and response
   remained visible in the running app.
9. After capturing the proof, the replacement Auth user and its three Firestore
   documents were deleted. Direct readback confirmed no remaining Auth user or
   conversations for that disposable UID.

## QA-discovered hardening

The QA iterations found and fixed two behaviors that narrower local checks did
not expose:

- concurrent token consumers could create more than one replacement anonymous
  account, so anonymous token refresh and recovery now use shared in-flight
  promises;
- the feature-flag refresh gate temporarily unmounted the chat after the Auth UID
  changed, hiding an otherwise successful recovery message. Refreshes now keep
  the already-initialized chat mounted, and the chat reset is UID-aware.

Local verification also passed `npm run typecheck` and
`node scripts/test-deleted-anon-session.mjs` against the Firebase Auth emulator.
The emulator test covers cold relaunch, running-app recovery, four concurrent
token consumers converging on one replacement UID, successful replacement-token
use, and no registered-user silent downgrade.
