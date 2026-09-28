package com.msme.seller.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Evidence photos, kept in app-private storage until they're uploaded (§8.3
 * step 2). Every photo is downscaled to at most [MAX_EDGE_PX] on its long edge
 * and re-encoded as JPEG: plenty for 224px grading models and verifier review,
 * and a fraction of a raw camera photo's size on a slow rural connection.
 */
@Singleton
class EvidenceFiles @Inject constructor(@ApplicationContext private val context: Context) {
    private val dir: File get() = File(context.filesDir, "evidence").apply { mkdirs() }

    /** An empty file + content Uri for the camera app to write a capture into. */
    fun newCaptureTarget(): Pair<File, Uri> {
        val file = File(dir, "${UUID.randomUUID()}.jpg")
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        return file to uri
    }

    /** Shrinks a finished camera capture in place. Returns null if the capture is empty/unreadable. */
    suspend fun finishCapture(file: File): File? = withContext(Dispatchers.IO) {
        if (!file.exists() || file.length() == 0L) return@withContext null.also { file.delete() }
        val bitmap = decode(Uri.fromFile(file)) ?: return@withContext null
        writeJpeg(bitmap, file)
        file
    }

    /** Copies (and shrinks) a gallery pick into app storage. */
    suspend fun importFromGallery(uri: Uri): File? = withContext(Dispatchers.IO) {
        val bitmap = decode(uri) ?: return@withContext null
        File(dir, "${UUID.randomUUID()}.jpg").also { writeJpeg(bitmap, it) }
    }

    fun delete(path: String) {
        File(path).delete()
    }

    fun deleteAll() {
        dir.listFiles()?.forEach { it.delete() }
    }

    private fun decode(uri: Uri): Bitmap? = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            // ImageDecoder also applies EXIF rotation, so portrait photos stay upright.
            val source = ImageDecoder.createSource(context.contentResolver, uri)
            ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
                val (w, h) = info.size.width to info.size.height
                val scale = MAX_EDGE_PX.toFloat() / maxOf(w, h)
                if (scale < 1f) decoder.setTargetSize((w * scale).toInt(), (h * scale).toInt())
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            }
        } else {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            var sample = 1
            while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_EDGE_PX) sample *= 2
            val options = BitmapFactory.Options().apply { inSampleSize = sample }
            context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
        }
    } catch (e: Exception) {
        null
    }

    private fun writeJpeg(bitmap: Bitmap, target: File) {
        target.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it) }
        bitmap.recycle()
    }

    private companion object {
        const val MAX_EDGE_PX = 1600
        const val JPEG_QUALITY = 85
    }
}
