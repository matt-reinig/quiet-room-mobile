# QR-MOB-021 Voice Playback Diagnostics Plan

## Physical-device production-flow diagnostics

### Goal

Move beyond emulator and simulator coverage now that Android saved-message playback has not reproduced clipping and the remaining unresolved reproduction signal is the iOS no-terminal-event behavior. Validate the actual production `MessageVoiceButton` flow on physical hardware, real networking, and real conversation data.

The goal