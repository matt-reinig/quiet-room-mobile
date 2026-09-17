package com.doublesymmetry.kotlinaudio.diagnostics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class NativeHttpCaptureTest {
    @Test
    fun stripsInternalHeadersAndBuildsBoundedCaptureContext() {
        val prepared = prepareNativeHttpCaptureHeaders(
            mapOf(
                "Authorization" to "Bearer private",
                CAPTURE_ENABLED_HEADER to "1",
                CAPTURE_RUN_HEADER to "run-safe_1",
                CAPTURE_ATTEMPT_HEADER to "attempt-safe.2",
                CAPTURE_ENDPOINT_HEADER to "live",
            )
        )

        assertEquals(mapOf("Authorization" to "Bearer private"), prepared.networkHeaders)
        assertEquals("run-safe_1", prepared.captureContext?.runId)
        assertEquals("attempt-safe.2", prepared.captureContext?.attemptId)
        assertEquals("live", prepared.captureContext?.endpointMode)
    }

    @Test
    fun stripsMalformedInternalHeadersWithoutEnablingCapture() {
        val prepared = prepareNativeHttpCaptureHeaders(
            mapOf(
                "authorization" to "Bearer private",
                CAPTURE_ENABLED_HEADER.lowercase() to "1",
                CAPTURE_RUN_HEADER.uppercase() to "../unsafe",
                CAPTURE_ATTEMPT_HEADER to "attempt-safe",
                CAPTURE_ENDPOINT_HEADER to "live",
            )
        )

        assertEquals(mapOf("authorization" to "Bearer private"), prepared.networkHeaders)
        assertNull(prepared.captureContext)
    }

    @Test
    fun allowsOnlyFixtureOrDirectLiveEndpoints() {
        val fixture = prepareNativeHttpCaptureHeaders(
            mapOf(
                CAPTURE_ENABLED_HEADER to "1",
                CAPTURE_RUN_HEADER to "run-safe",
                CAPTURE_ATTEMPT_HEADER to "attempt-safe",
                CAPTURE_ENDPOINT_HEADER to "fixture",
            )
        )
        val proxy = prepareNativeHttpCaptureHeaders(
            mapOf(
                CAPTURE_ENABLED_HEADER to "1",
                CAPTURE_RUN_HEADER to "run-safe",
                CAPTURE_ATTEMPT_HEADER to "attempt-safe",
                CAPTURE_ENDPOINT_HEADER to "live-proxy",
            )
        )

        assertNotNull(fixture.captureContext)
        assertNull(proxy.captureContext)
    }
}
