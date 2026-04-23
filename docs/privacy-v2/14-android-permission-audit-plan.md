# Task 14 — Android Permission Audit Plan

## Goal

Inspect the actual Android store-candidate build, confirm every shipped permission is intentional, remove any unnecessary sensitive permissions, and align the final permission set with Quiet Room's real product behavior and Play disclosures.

This task exists because Play review is sensitive to permissions that imply capabilities the app does not actually use.

---

## Why This Task Exists

Quiet Room includes voice playback, sign-in, networking, and release-build packaging, but does not intentionally record audio from the user's microphone.

That means the Android permission surface should reflect the actual product truth:
- audio playback is intentional
- microphone recording is not part of the shipped user experience
- any permission that suggests recording or other sensitive access must be justified or removed

The original research doc explicitly called out `RECORD_AUDIO` as a likely review-risk permission to verify. This task turns that into a concrete audit and removal decision.

---

## Decisions Locked For This Task

### Product truth
- Quiet Room supports text-to-speech playback
- Quiet Room does not intentionally record user audio in the shipped app

### Permission implication
- text-to-speech playback alone does **not** justify `android.permission.RECORD_AUDIO`
- if `RECORD_AUDIO` appears in the final manifest, it should be treated as suspicious and removed unless a real shipped microphone feature is discovered

### Outcome standard
- every remaining Android permission in the release build must be supportable in:
  - the actual product behavior
  - the privacy policy site
  - Play Console declarations

---

## Required Outputs

This task must produce all of the following:

1. the final list of permissions in the actual Android release manifest
2. a reason for each shipped permission
3. a keep/remove decision for each review-relevant permission
4. removal or override of any unnecessary sensitive permission
5. updated disclosure notes if any permission affects Play answers

---

## Scope

### In scope
- inspect the actual release manifest for the Android store candidate
- identify which dependency or config likely introduced each sensitive permission
- decide whether each permission is intentional
- remove or override permissions that are not required
- align the final permission set with Play disclosure expectations

### Out of scope
- unrelated Android UX work
- iOS permission analysis
- long-term analytics setup

---

## Known Risk Area

Based on current repository state, `expo-av` is the most likely source of microphone-permission pressure because it can participate in audio-related native capability generation.

This does **not** mean the permission is definitely present.
It does mean the final manifest must be checked directly rather than assumed from JavaScript code alone.

---

## Implementation Plan

### Step 1 — Inspect the actual release manifest

Inspect the generated Android manifest for the real release candidate build, not just source assumptions.

Target:
- the final merged manifest or equivalent release-build manifest used for Play submission

Deliverable:
- one explicit list of all permissions present in the release build

---

### Step 2 — Identify review-relevant permissions

From the final manifest, call out any permissions that are sensitive or likely to matter in Play review.

Examples to pay attention to:
- `android.permission.RECORD_AUDIO`
- storage/media permissions if present
- camera permissions if present
- notification permissions if present

Deliverable:
- one reviewed subset of permissions that require justification

---

### Step 3 — Explain why each permission exists

For each permission in the final manifest, identify:
- which package/config likely introduced it
- which shipped product behavior depends on it
- whether it is truly intentional

For `RECORD_AUDIO`, explicitly answer:
- does the shipped app record user audio?
- if no, why is this permission present?
- can it be removed or blocked from the final manifest?

---

### Step 4 — Remove unnecessary sensitive permissions

If a permission is not required by the shipped product behavior, remove it from the Android release manifest.

For `RECORD_AUDIO`, the expected outcome is:
- remove/override it if present, unless a real shipped microphone feature is discovered

Possible mechanisms may include:
- package/config adjustments
- manifest override/removal
- dependency/plugin configuration changes
- release-only native config fixes

This task is not complete if the team merely understands why a bad permission is present but leaves it unchanged without good reason.

---

### Step 5 — Rebuild and re-verify the final manifest

After any permission changes, regenerate or rebuild the Android release candidate and inspect the final manifest again.

Deliverable:
- before/after confirmation of the permission set

---

### Step 6 — Align Play disclosure assumptions

If the final permission set changes, update any store/disclosure planning assumptions that depend on it.

Examples:
- if microphone permission is removed, ensure Play disclosures do not imply microphone recording
- if any remaining sensitive permission stays, ensure there is truthful supporting language in the app/site/store answers

---

## Audit Questions This Task Must Answer

By the end of this task, the answer to each must be explicit:

- What permissions ship in the final Android release manifest?
- Is `RECORD_AUDIO` present?
- If `RECORD_AUDIO` is present, is there a real shipped microphone feature that requires it?
- If not, has it been removed or overridden?
- Does every remaining permission match the real behavior of Quiet Room?
- Do Play Console answers remain truthful relative to the final manifest?

---

## Verification Strategy

### Verification 1 — Final manifest proof

Capture proof of the final Android release permission set.

Accepted proof:
- merged manifest output
- APK/AAB manifest inspection output
- build artifact report showing final permissions

---

### Verification 2 — Sensitive permission decision

Capture one explicit keep/remove decision for each sensitive permission.

For `RECORD_AUDIO`, the result should be one of:
- removed
- intentionally kept, with a real shipped-feature justification

---

### Verification 3 — Product truth alignment

Confirm the final manifest does not imply capabilities the app does not actually ship.

For Quiet Room, the main check is:
- TTS playback is present
- microphone recording is not implied unless genuinely shipped

---

## Suggested Deliverables

- reviewed final Android permission list
- keep/remove justification notes
- manifest/config change if needed
- rebuilt release candidate verification
- any follow-up update needed for Play disclosure notes

---

## Definition Of Done

- the final Android release manifest has been inspected directly
- every shipped Android permission has a clear justification
- unnecessary sensitive permissions have been removed or overridden
- `RECORD_AUDIO` is removed unless a real shipped microphone feature truly requires it
- the final Android permission surface matches Quiet Room's real shipped behavior
- Play disclosure work is unblocked by a concrete and verified permission set

---

## Audit Result — 2026-04-22

Status: complete for the current local Android release candidate.

### Verified build

- Command: `cd android && ./gradlew :app:bundleRelease`
- Result: success
- Release manifest proof:
  - `android/app/build/intermediates/merged_manifest/release/processReleaseMainManifest/AndroidManifest.xml`
  - `android/app/build/intermediates/bundle_manifest/release/processApplicationManifestReleaseForBundle/AndroidManifest.xml`
  - `android/app/build/intermediates/packaged_manifests/release/processReleaseManifestForPackage/AndroidManifest.xml`

### Final release permissions

The rebuilt release manifests contain:

- `android.permission.INTERNET`
- `android.permission.MODIFY_AUDIO_SETTINGS`
- `android.permission.ACCESS_NETWORK_STATE`
- `com.quietroom.mobile.qa.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`
- `com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE`

### Permission decisions

| Permission | Source | Product behavior | Decision |
|---|---|---|---|
| `android.permission.INTERNET` | app manifest and `expo-file-system` | API calls, auth, web content, and voice playback downloads | keep |
| `android.permission.MODIFY_AUDIO_SETTINGS` | `expo-av` playback config | voice/TTS playback uses `Audio.setAudioModeAsync` | keep |
| `android.permission.ACCESS_NETWORK_STATE` | AndroidX/Google Play dependencies | network-aware platform/library behavior | keep |
| `com.quietroom.mobile.qa.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | AndroidX Core generated app-specific permission | protects dynamically registered app receivers | keep |
| `com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE` | Google Play install referrer dependency through Google services/auth stack | Play services install-referrer integration | keep |
| `android.permission.RECORD_AUDIO` | previously present in generated native manifest; `expo-av` can request it when microphone support is enabled | Quiet Room does not record microphone audio | remove |
| `android.permission.READ_EXTERNAL_STORAGE` | Expo template / `expo-file-system` manifest | Quiet Room writes generated voice MP3 files to app cache only; no broad user media read flow ships | remove |
| `android.permission.WRITE_EXTERNAL_STORAGE` | Expo template / `expo-file-system` manifest | Quiet Room writes generated voice MP3 files to app cache only; no broad external storage write flow ships | remove |
| `android.permission.SYSTEM_ALERT_WINDOW` | Expo template optional permission | no shipped overlay feature | remove |
| `android.permission.VIBRATE` | Expo template optional permission | no shipped haptics/vibration feature | remove |

### Changes made

- Added `expo-av` config in `app.json` with `"microphonePermission": false`.
- Added Android `blockedPermissions` in `app.json` for:
  - `android.permission.READ_EXTERNAL_STORAGE`
  - `android.permission.RECORD_AUDIO`
  - `android.permission.SYSTEM_ALERT_WINDOW`
  - `android.permission.VIBRATE`
  - `android.permission.WRITE_EXTERNAL_STORAGE`
- Updated the local generated Android manifest with `tools:node="remove"` entries so the current local release build immediately reflects the same removals. The generated `android/` project is gitignored, so `app.json` is the tracked source of truth for future native syncs.

### Play disclosure alignment

- `RECORD_AUDIO` is absent from the rebuilt release manifest.
- Quiet Room should not declare microphone collection or microphone recording in Play Console answers.
- No camera, notification, storage/media, or microphone runtime permissions remain in the release manifest.
- Remaining permissions match the shipped app behavior and do not require new sensitive-data policy copy.
