# Ambient audio experiment implementation

This is the mobile implementation of the product plan in Gabriel commit `8a6fee7b059ba117d6917b15b97a15541561b10d`.

## Initial surface

The first experiment ships in the native Quiet Room experience on both iOS and Android. The hosted web/desktop Quiet Room is deferred because it has a separate `HTMLAudioElement` architecture and browser autoplay/visibility constraints. Mobile WebView parity mode continues to show the hosted web behavior and therefore does not expose this selector yet.

The environment names and persisted semantics should remain the contract for a later web implementation:

`Off · Brown Noise · Rain · Quiet Church · Faint Chant`

## Behavior

- `ambient_audio` is recognized through the existing backend-owned feature-flag response and defaults off.
- When the flag is disabled, the selector is absent and no ambient player is created. A previously stored choice is retained for a later re-enable.
- The selector lives in the existing quiet `+` options popover rather than adding a new navigation destination.
- `Off` is the default for a missing or invalid local preference.
- The selection is stored locally under `gabriel.ambientAudio.environment.v1`.
- A dedicated `expo-audio` player owns one bundled track at a time, loops it, and uses a low environment-specific gain.
- Track changes, Off, app backgrounding, and foreground voice playback fade the ambience down. The ambience resumes after the app becomes active or the foreground voice owner finishes.
- The player is removed when the flag turns off or Quiet Room unmounts. Ambient audio never requests background playback.
- Foreground message/Scripture/TTS playback remains authoritative. The existing voice playback bus now reports both start and owner-safe stop events so a superseded voice player cannot incorrectly resume ambience.

No selection analytics were added. The existing client-event endpoint currently accepts only `voice_playback.*` events; expanding its allowlist and backend contracts solely for this experiment would exceed the plan's analytics boundary.

## Flag operations

The backend feature-flag system accepts arbitrary flag documents, so no backend code change is required. Create an allowlisted QA flag only when tester enablement is explicitly requested, following `Gabriel/docs/feature_flags.md`, for example:

```bash
python Gabriel/db_scripts/feature_flags.py --env qa upsert \
  --flag ambient_audio \
  --enabled true \
  --users <comma-separated-test-uids> \
  --percentage 0 \
  --description "Ambient audio experiment"
```

This implementation does not create or mutate QA or production flag data.

## Verification boundary

Automated coverage verifies flag-off UI absence, all five choices, persistence, Off, and live flag disable behavior. TypeScript verification covers the player and selector integration. Audible loop quality, platform interruptions, foreground-audio intelligibility, output routing, and installed binary-size growth remain manual/native-artifact gates before enabling testers; see `docs/ambient-audio-assets.md`.
