package com.CAPDATABASE.capdatabase.ui.theme

import android.content.Context

/**
 * The three appearance choices offered in Settings > Appearance.
 *
 * [Dark] is the default for an account that has never chosen: it is the only scheme this app
 * has ever had, so upgrading does not silently change how the app looks for existing users.
 */
enum class CapThemeMode(val storageKey: String, val label: String, val description: String) {
    Light("light", "Light", "Always use the light appearance."),
    Dark("dark", "Dark", "Always use the dark appearance."),
    System("system", "Follow system", "Match this device's own light/dark setting.");

    companion object {
        /** Unknown/absent values fall back to [Dark] rather than throwing — a preferences file
         *  written by a future version must never crash an older build. */
        fun fromStorageKey(key: String?): CapThemeMode =
            entries.firstOrNull { it.storageKey == key } ?: Dark
    }
}

/**
 * Local persistence for the appearance choice.
 *
 * Plain [android.content.SharedPreferences] on purpose:
 *
 * - This is a display preference, not credential material, so it deliberately does NOT go
 *   through `SupabaseAuth.kt`'s Keystore-backed `EncryptedSharedPreferences` — that store
 *   exists for session tokens, is owned by the data layer, and encrypting "the user likes
 *   light mode" buys nothing.
 * - Nothing in this app persists a simple local preference yet, so there is no existing
 *   pattern to reuse. `androidx.datastore:datastore-preferences` is already on the dependency
 *   list but is not referenced anywhere in the source tree, and its async/Flow API cannot
 *   answer "which colour scheme?" synchronously before the first frame — which is exactly
 *   what avoiding a flash of the wrong theme requires. No new Gradle dependency was added.
 */
object CapThemePreferences {
    private const val FILE_NAME = "cap_appearance"
    private const val KEY_MODE = "theme_mode"

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    fun load(context: Context): CapThemeMode =
        CapThemeMode.fromStorageKey(prefs(context).getString(KEY_MODE, null))

    fun save(context: Context, mode: CapThemeMode) {
        prefs(context).edit().putString(KEY_MODE, mode.storageKey).apply()
    }
}
