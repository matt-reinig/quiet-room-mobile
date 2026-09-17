# KotlinAudio 2.1.0 diagnostic fork

This directory vendors the `kotlin-audio` Android library from Double Symmetry's
KotlinAudio `v2.1.0` tag at commit
`bf71120704bfe4be2311cf86fc1e2ee1c3c702b7`.

The upstream project is licensed under Apache License 2.0; the unmodified
license is retained as `LICENSE`. The only functional change is the
QR-MOB-021 opt-in HTTP data-source capture. Gradle selects this source module
only when `QR_MOB_021_NATIVE_CAPTURE=true`; normal builds continue using the
published `com.github.doublesymmetry:kotlinaudio:v2.1.0` artifact.

The capture activates only when the app supplies all bounded internal
diagnostic headers. Those headers are removed before the request reaches the
network. Each native data-source open writes a separate response-body file and
privacy-bounded JSON metadata under the app-specific external files directory.
