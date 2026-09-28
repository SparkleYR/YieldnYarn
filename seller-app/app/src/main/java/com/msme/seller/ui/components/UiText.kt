package com.msme.seller.ui.components

import android.content.Context
import androidx.annotation.StringRes

/** A message that's either one of our (translated) strings or server-provided text. */
sealed interface UiText {
    data class Res(@StringRes val id: Int) : UiText
    data class Raw(val text: String) : UiText

    fun resolve(context: Context): String = when (this) {
        is Res -> context.getString(id)
        is Raw -> text
    }
}
