package com.doublesymmetry.kotlinaudio.diagnostics

import android.content.Context
import android.net.Uri
import android.os.SystemClock
import android.util.Log
import com.google.android.exoplayer2.upstream.DataSource
import com.google.android.exoplayer2.upstream.DataSpec
import com.google.android.exoplayer2.upstream.TransferListener
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

internal const val CAPTURE_ENABLED_HEADER = "X-QR-MOB-021-Native-Capture"
internal const val CAPTURE_RUN_HEADER = "X-QR-MOB-021-Run-Id"
internal const val CAPTURE_ATTEMPT_HEADER = "X-QR-MOB-021-Attempt-Id"
internal const val CAPTURE_ENDPOINT_HEADER = "X-QR-MOB-021-Capture-Endpoint"

private const val CAPTURE_LOG_TAG = "QR_MOB_021_CAPTURE"
private const val CAPTURE_LOG_PREFIX = "QR_MOB_021_NATIVE_CAPTURE "
private val SAFE_ID = Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$")
private val SAFE_ENDPOINTS = setOf("fixture", "live")
private val INTERNAL_HEADERS = setOf(
    CAPTURE_ENABLED_HEADER.lowercase(),
    CAPTURE_RUN_HEADER.lowercase(),
    CAPTURE_ATTEMPT_HEADER.lowercase(),
    CAPTURE_ENDPOINT_HEADER.lowercase(),
)

internal data class NativeHttpCaptureContext(
    val runId: String,
    val attemptId: String,
    val endpointMode: String,
)

internal data class PreparedCaptureHeaders(
    val captureContext: NativeHttpCaptureContext?,
    val networkHeaders: Map<String, String>,
)

internal fun prepareNativeHttpCaptureHeaders(
    headers: Map<String, String>?,
): PreparedCaptureHeaders {
    if (headers.isNullOrEmpty()) {
        return PreparedCaptureHeaders(null, emptyMap())
    }

    val internalValues = headers.entries.associate { it.key.lowercase() to it.value }
    val networkHeaders = headers.filterKeys { it.lowercase() !in INTERNAL_HEADERS }
    val enabled = internalValues[CAPTURE_ENABLED_HEADER.lowercase()] == "1"
    val runId = internalValues[CAPTURE_RUN_HEADER.lowercase()]
    val attemptId = internalValues[CAPTURE_ATTEMPT_HEADER.lowercase()]
    val endpointMode = internalValues[CAPTURE_ENDPOINT_HEADER.lowercase()]
    val captureContext = if (
        enabled &&
        runId != null && SAFE_ID.matches(runId) &&
        attemptId != null && SAFE_ID.matches(attemptId) &&
        endpointMode in SAFE_ENDPOINTS
    ) {
        NativeHttpCaptureContext(runId, attemptId, endpointMode!!)
    } else {
        null
    }

    return PreparedCaptureHeaders(captureContext, networkHeaders)
}

internal class NativeHttpCaptureDataSourceFactory(
    context: Context,
    private val upstreamFactory: DataSource.Factory,
    private val captureContext: NativeHttpCaptureContext,
) : DataSource.Factory {
    private val applicationContext = context.applicationContext
    private val requestSequence = AtomicInteger(0)

    override fun createDataSource(): DataSource {
        return NativeHttpCaptureDataSource(
            applicationContext,
            upstreamFactory.createDataSource(),
            captureContext,
            requestSequence,
        )
    }
}

private class NativeHttpCaptureDataSource(
    private val context: Context,
    private val upstream: DataSource,
    private val captureContext: NativeHttpCaptureContext,
    private val requestSequence: AtomicInteger,
) : DataSource {
    private var capture: RequestCapture? = null

    override fun addTransferListener(transferListener: TransferListener) {
        upstream.addTransferListener(transferListener)
    }

    override fun open(dataSpec: DataSpec): Long {
        val requestCapture = RequestCapture(
            context,
            captureContext,
            requestSequence.incrementAndGet(),
            dataSpec,
        )
        capture = requestCapture
        return try {
            val openedLength = upstream.open(dataSpec)
            requestCapture.onOpen(openedLength, upstream.responseHeaders.keys)
            openedLength
        } catch (error: IOException) {
            requestCapture.onOpenError(error)
            throw error
        }
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        return try {
            val read = upstream.read(buffer, offset, length)
            if (read < 0) {
                capture?.onEndOfInput()
            } else if (read > 0) {
                capture?.onBytes(buffer, offset, read)
            }
            read
        } catch (error: IOException) {
            capture?.onReadError(error)
            throw error
        }
    }

    override fun getUri(): Uri? = upstream.uri

    override fun getResponseHeaders(): Map<String, List<String>> = upstream.responseHeaders

    override fun close() {
        var closeError: IOException? = null
        try {
            upstream.close()
        } catch (error: IOException) {
            closeError = error
            capture?.onCloseError(error)
        } finally {
            capture?.finish()
            capture = null
        }
        if (closeError != null) {
            throw closeError
        }
    }
}

private class RequestCapture(
    context: Context,
    private val captureContext: NativeHttpCaptureContext,
    private val requestSequence: Int,
    private val dataSpec: DataSpec,
) {
    private val finished = AtomicBoolean(false)
    private val digest = MessageDigest.getInstance("SHA-256")
    private val captureDirectory = captureDirectory(context, captureContext)
    private val basename = "request-${requestSequence.toString().padStart(3, '0')}-position-${dataSpec.position}"
    private val partialBody = File(captureDirectory, "$basename.bin.partial")
    private val finalBody = File(captureDirectory, "$basename.bin")
    private val metadataFile = File(captureDirectory, "$basename.json")
    private val output: BufferedOutputStream?
    private val openedAtEpochMs = System.currentTimeMillis()
    private val openedAtElapsedRealtimeMs = SystemClock.elapsedRealtime()
    private var upstreamOpenLength: Long = -1
    private var bytesCaptured: Long = 0
    private var firstByteElapsedRealtimeMs: Long? = null
    private var lastByteElapsedRealtimeMs: Long? = null
    private var captureWriteDurationNs: Long = 0
    private var maxCaptureWriteDurationNs: Long = 0
    private var eofObserved = false
    private var responseHeaderNames: Set<String> = emptySet()
    private var upstreamErrorClass: String? = null
    private var captureErrorClass: String? = null

    init {
        captureDirectory.mkdirs()
        output = try {
            BufferedOutputStream(FileOutputStream(partialBody), 64 * 1024)
        } catch (error: IOException) {
            captureErrorClass = error.javaClass.simpleName
            null
        }
    }

    fun onOpen(openedLength: Long, headerNames: Set<String>) {
        upstreamOpenLength = openedLength
        responseHeaderNames = headerNames.map { it.lowercase() }.toSortedSet()
    }

    fun onOpenError(error: IOException) {
        upstreamErrorClass = error.javaClass.simpleName
        finish()
    }

    fun onBytes(buffer: ByteArray, offset: Int, length: Int) {
        if (captureErrorClass != null) return
        val stream = output ?: return
        val startedNs = SystemClock.elapsedRealtimeNanos()
        try {
            stream.write(buffer, offset, length)
            digest.update(buffer, offset, length)
            bytesCaptured += length
            val nowMs = SystemClock.elapsedRealtime()
            if (firstByteElapsedRealtimeMs == null) {
                firstByteElapsedRealtimeMs = nowMs
            }
            lastByteElapsedRealtimeMs = nowMs
        } catch (error: IOException) {
            captureErrorClass = error.javaClass.simpleName
            try {
                stream.close()
            } catch (_: IOException) {
                // The bounded metadata records the first capture failure.
            }
        } finally {
            val durationNs = SystemClock.elapsedRealtimeNanos() - startedNs
            captureWriteDurationNs += durationNs
            maxCaptureWriteDurationNs = maxOf(maxCaptureWriteDurationNs, durationNs)
        }
    }

    fun onEndOfInput() {
        eofObserved = true
    }

    fun onReadError(error: IOException) {
        upstreamErrorClass = error.javaClass.simpleName
    }

    fun onCloseError(error: IOException) {
        upstreamErrorClass = error.javaClass.simpleName
    }

    fun finish() {
        if (!finished.compareAndSet(false, true)) return

        try {
            output?.flush()
            output?.close()
        } catch (error: IOException) {
            if (captureErrorClass == null) {
                captureErrorClass = error.javaClass.simpleName
            }
        }

        val retainedBody = when {
            !partialBody.exists() -> null
            partialBody.renameTo(finalBody) -> finalBody
            else -> partialBody
        }
        val completedByLength = upstreamOpenLength >= 0 && bytesCaptured >= upstreamOpenLength
        val terminalState = when {
            upstreamErrorClass != null -> "error"
            eofObserved || completedByLength -> "completed"
            else -> "closed-before-eof"
        }
        val metadata = JSONObject().apply {
            put("schemaVersion", "qr-mob-021.native-capture.v1")
            put("runId", captureContext.runId)
            put("attemptId", captureContext.attemptId)
            put("endpointMode", captureContext.endpointMode)
            put("requestSequence", requestSequence)
            put("httpMethod", dataSpec.httpMethodString)
            put("position", dataSpec.position)
            put("requestedLength", dataSpec.length)
            put("upstreamOpenLength", upstreamOpenLength)
            put("bytesCaptured", bytesCaptured)
            put("sha256", if (bytesCaptured > 0) digest.digest().toHex() else JSONObject.NULL)
            put("terminalState", terminalState)
            put("eofObserved", eofObserved)
            put("openedAtEpochMs", openedAtEpochMs)
            put("openedAtElapsedRealtimeMs", openedAtElapsedRealtimeMs)
            put("firstByteElapsedRealtimeMs", firstByteElapsedRealtimeMs ?: JSONObject.NULL)
            put("lastByteElapsedRealtimeMs", lastByteElapsedRealtimeMs ?: JSONObject.NULL)
            put("closedAtEpochMs", System.currentTimeMillis())
            put("closedAtElapsedRealtimeMs", SystemClock.elapsedRealtime())
            put("captureWriteDurationNs", captureWriteDurationNs)
            put("maxCaptureWriteDurationNs", maxCaptureWriteDurationNs)
            put("responseHeaderNames", JSONArray(responseHeaderNames.toList()))
            put("bodyFile", retainedBody?.name ?: JSONObject.NULL)
            put("upstreamErrorClass", upstreamErrorClass ?: JSONObject.NULL)
            put("captureErrorClass", captureErrorClass ?: JSONObject.NULL)
        }
        writeMetadata(metadata)
        Log.i(CAPTURE_LOG_TAG, CAPTURE_LOG_PREFIX + metadata.toString())
    }

    private fun writeMetadata(metadata: JSONObject) {
        val temporary = File(captureDirectory, "$basename.json.partial")
        try {
            temporary.writeText(metadata.toString(2) + "\n")
            if (!temporary.renameTo(metadataFile)) {
                metadataFile.writeText(metadata.toString(2) + "\n")
                temporary.delete()
            }
        } catch (error: IOException) {
            Log.w(CAPTURE_LOG_TAG, "QR-MOB-021 capture metadata write failed: ${error.javaClass.simpleName}")
        }
    }
}

private fun captureDirectory(
    context: Context,
    captureContext: NativeHttpCaptureContext,
): File {
    val root = context.getExternalFilesDir("qr-mob-021-native-captures")
        ?: File(context.filesDir, "qr-mob-021-native-captures")
    return File(File(root, captureContext.runId), captureContext.attemptId)
}

private fun ByteArray.toHex(): String = joinToString("") { byte -> "%02x".format(byte) }
