package com.msme.seller.core.api

import com.google.gson.JsonParser
import retrofit2.Response
import java.io.IOException

/** Outcome of one API call, with DRF error bodies turned into readable text. */
sealed interface ApiResult<out T> {
    data class Success<T>(val value: T, val code: Int) : ApiResult<T>

    /** The server answered with an error status. */
    data class HttpError(val code: Int, val message: String) : ApiResult<Nothing>

    /** No usable answer at all (offline, timeout, DNS...). */
    data class NetworkError(val cause: IOException) : ApiResult<Nothing>
}

val ApiResult<*>.errorMessage: String?
    get() = when (this) {
        is ApiResult.Success -> null
        is ApiResult.HttpError -> message
        is ApiResult.NetworkError -> "Can't reach the server. Check your connection."
    }

fun <T> ApiResult<T>.getOrNull(): T? = (this as? ApiResult.Success)?.value

inline fun <T, R> ApiResult<T>.map(transform: (T) -> R): ApiResult<R> = when (this) {
    is ApiResult.Success -> ApiResult.Success(transform(value), code)
    is ApiResult.HttpError -> this
    is ApiResult.NetworkError -> this
}

/**
 * Runs a Retrofit call and classifies the result. `Unit`-typed calls succeed
 * with an empty body (e.g. 204).
 */
suspend fun <T> apiCall(block: suspend () -> Response<T>): ApiResult<T> {
    val response = try {
        block()
    } catch (e: IOException) {
        return ApiResult.NetworkError(e)
    }
    if (response.isSuccessful) {
        @Suppress("UNCHECKED_CAST")
        val body = response.body() ?: Unit as T
        return ApiResult.Success(body, response.code())
    }
    val raw = try {
        response.errorBody()?.string()
    } catch (e: IOException) {
        null
    }
    return ApiResult.HttpError(response.code(), DrfErrors.message(raw, response.code()))
}

/** Flattens DRF's error shapes into one line of text. */
object DrfErrors {
    fun message(body: String?, code: Int): String {
        val fallback = when (code) {
            401 -> "Your session has expired. Please log in again."
            403 -> "You don't have permission to do that."
            404 -> "Not found."
            in 500..599 -> "The server had a problem. Please try again."
            else -> "Request failed ($code)."
        }
        if (body.isNullOrBlank()) return fallback
        return try {
            val json = JsonParser.parseString(body)
            when {
                json.isJsonObject -> {
                    val obj = json.asJsonObject
                    obj.get("detail")?.takeIf { it.isJsonPrimitive }?.asString
                        ?: obj.entrySet().joinToString("\n") { (field, value) ->
                            val text = if (value.isJsonArray) {
                                value.asJsonArray.joinToString(" ") { it.asString }
                            } else {
                                value.toString()
                            }
                            if (field == "non_field_errors") text else "${field.replace('_', ' ')}: $text"
                        }.ifBlank { fallback }
                }
                json.isJsonArray -> json.asJsonArray.joinToString(" ") { it.asString }
                else -> fallback
            }
        } catch (e: Exception) {
            fallback
        }
    }
}
