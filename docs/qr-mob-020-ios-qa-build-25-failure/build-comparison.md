# QR-MOB-020 - Build Comparison

## Build Map

| Build | Commit evidence | Notes |
| --- | --- | --- |
| `23` | `b947e93` - `Bump iOS QA build for startup redeploy` | Last known-good QA iOS build from tracker. `app.json` set `ios.buildNumber` to `23`. |
| `24` | `65cfa60` - `Bump QA store build counters` | QA build-counter bump after the voice playback cache change. `app.json` set `ios.buildNumber` to `24`. |
| `25` | `82c766f` - `Bump QA store builds after voice playback revert` | QA build-counter bump after reverting the voice playback cache change. `app.json` set `ios.buildNumber` to `25`. |

## Relevant Timeline

- `bda0bfb` added the `react-native-safe-area-context` dependency.
- `b7ed619` started rendering Safe Area components in `QuietRoomScreen`.
- `b947e93` bumped iOS QA build `23`.
- `3f68ed0` added local voice playback audio caching.
- `65cfa60` bumped QA store counters to iOS build `24`.
- `30cb939` reverted the voice playback audio caching change.
- `82c766f` bumped QA store counters to iOS build `25`.
- `8e906bd` added this QR-MOB-020 investigation plan.

## Source Diff Assessment

The obvious source delta between builds `24` and `25` is the voice playback cache change and its revert. That does not explain the reproduced startup failure:

- The local failure happens before interacting with voice playback.
- The app fails while mounting native React components.
- The simulator log names `RNCSafeAreaProvider`, not audio playback or file caching.
- Re-running native sync fixes the launch without changing the source code.

The Safe Area dependency predates build `23`, so build `23` can still be last-known-good if it was uploaded from a machine/native tree that had already been synced. Builds `24` and `25` can fail if they were archived later from a stale generated `ios/` tree that did not include the Safe Area pod/codegen.

## Native Artifact Difference

Before `npm run native:sync:qa -- ios`, the local generated iOS tree lacked the Safe Area native dependency:

- no `react-native-safe-area-context` entry in `ios/Podfile.lock`
- no `react-native-safe-area-context` entry in `ios/Pods/Manifest.lock`
- no `RNCSafeAreaProvider` codegen entry in the generated component provider

After native sync:

- `ios/Podfile.lock` includes `react-native-safe-area-context (5.6.2)`
- `ios/Pods/Manifest.lock` includes `react-native-safe-area-context (5.6.2)`
- `ios/build/generated/ios/RCTThirdPartyComponentsProvider.mm` maps:
  - `RNCSafeAreaProvider`
  - `RNCSafeAreaView`

## Config Assessment

Current `develop` QA configuration looks correct:

- `Quiet Room QA`
- `com.quietroom.mobile.qa`
- build `25`
- `GoogleService-Info.qa.plist`
- Firebase project `gabriel-qa-89f20`
- empty `firebaseAuthEmulatorHost`
- QA API URL
- QA streaming URL

The synced build's Info.plist matches the QA lane:

- `CFBundleIdentifier`: `com.quietroom.mobile.qa`
- `CFBundleVersion`: `25`
- `CFBundleDisplayName`: `Quiet Room QA`

## Conclusion

Build `25` should be treated as suspect because of build artifact state, not because current `develop` source is known-bad. Build `24` may have the same artifact issue if it was uploaded from the same stale native tree. Build `23` remains a plausible last-known-good because the tracker recorded release-simulator home-screen proof and TestFlight upload proof for that build.
