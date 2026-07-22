package com.CAPDATABASE.capdatabase

import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Read-only client for the Firebase Cloud Functions Google Calendar endpoints
 * (googleCalendarEvents / googleCalendarStatus). Android is a viewer only -
 * connecting, disconnecting, or selecting calendars is web-only (System Settings,
 * admin-only). This repository never handles OAuth and never stores or logs the
 * Firebase ID token.
 */
data class GoogleCalendarEvent(
    val id: String,
    val title: String,
    val start: String,
    val end: String?,
    val allDay: Boolean,
    val calendarName: String?,
    val location: String?,
    val description: String?,
    val organiser: String?,
    val htmlLink: String?
)

data class GoogleCalendarEventsResult(
    val events: List<GoogleCalendarEvent> = emptyList(),
    val warnings: List<String> = emptyList(),
    val error: String? = null
)

data class GoogleCalendarStatusResult(
    val connected: Boolean = false,
    val requiresReconnection: Boolean = false,
    val accountEmail: String? = null,
    val error: String? = null
)

@Singleton
class GoogleCalendarRepository @Inject constructor(
    private val auth: FirebaseAuth
) {
    private val eventsUrl = "${BuildConfig.FUNCTIONS_BASE_URL}/googleCalendarEvents"
    private val statusUrl = "${BuildConfig.FUNCTIONS_BASE_URL}/googleCalendarStatus"

    suspend fun fetchEvents(startIso: String, endIso: String): GoogleCalendarEventsResult =
        withContext(Dispatchers.IO) {
            val token = try {
                auth.currentUser?.getIdToken(false)?.await()?.token
            } catch (_: Exception) {
                null
            }
            if (token.isNullOrBlank()) {
                return@withContext GoogleCalendarEventsResult(
                    error = "Please sign in to view Google Calendar events."
                )
            }
            try {
                val query = "start=${java.net.URLEncoder.encode(startIso, "UTF-8")}" +
                    "&end=${java.net.URLEncoder.encode(endIso, "UTF-8")}"
                val body = httpGet("$eventsUrl?$query", token)
                parseEventsResponse(body)
            } catch (_: Exception) {
                GoogleCalendarEventsResult(
                    error = "Unable to load Google Calendar events right now. Please try again later."
                )
            }
        }

    suspend fun fetchStatus(): GoogleCalendarStatusResult =
        withContext(Dispatchers.IO) {
            val token = try {
                auth.currentUser?.getIdToken(false)?.await()?.token
            } catch (_: Exception) {
                null
            }
            if (token.isNullOrBlank()) {
                return@withContext GoogleCalendarStatusResult(
                    error = "Please sign in to view Google Calendar status."
                )
            }
            try {
                val body = httpGet(statusUrl, token)
                val json = JSONObject(body)
                GoogleCalendarStatusResult(
                    connected = json.optBoolean("connected", false),
                    requiresReconnection = json.optBoolean("requires_reconnection", false),
                    accountEmail = json.optStringOrNull("account_email")
                )
            } catch (_: Exception) {
                GoogleCalendarStatusResult(
                    error = "Unable to load Google Calendar status right now. Please try again later."
                )
            }
        }

    private fun httpGet(url: String, token: String): String {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "GET"
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Accept", "application/json")
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            val responseCode = connection.responseCode
            val stream = if (responseCode in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.let { readStream(it) }.orEmpty()
            if (responseCode !in 200..299) {
                throw java.io.IOException("Request failed with status $responseCode")
            }
            return text
        } finally {
            connection.disconnect()
        }
    }

    private fun readStream(stream: java.io.InputStream): String =
        BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }

    private fun parseEventsResponse(body: String): GoogleCalendarEventsResult {
        val json = JSONObject(body)
        val events = mutableListOf<GoogleCalendarEvent>()
        val eventsArray = json.optJSONArray("events") ?: JSONArray()
        for (index in 0 until eventsArray.length()) {
            val item = eventsArray.optJSONObject(index) ?: continue
            val id = item.optStringOrNull("id") ?: continue
            val title = item.optStringOrNull("title") ?: "Untitled event"
            val start = item.optStringOrNull("start") ?: continue
            val extendedProps = item.optJSONObject("extendedProps")
            events.add(
                GoogleCalendarEvent(
                    id = id,
                    title = title,
                    start = start,
                    end = item.optStringOrNull("end"),
                    allDay = item.optBoolean("allDay", false),
                    calendarName = extendedProps?.optStringOrNull("calendarName"),
                    location = extendedProps?.optStringOrNull("location"),
                    description = extendedProps?.optStringOrNull("description"),
                    organiser = extendedProps?.optStringOrNull("organiser"),
                    htmlLink = extendedProps?.optStringOrNull("htmlLink")
                )
            )
        }
        val warnings = mutableListOf<String>()
        val warningsArray = json.optJSONArray("warnings")
        if (warningsArray != null) {
            for (index in 0 until warningsArray.length()) {
                warningsArray.optString(index, null)?.let { warnings.add(it) }
            }
        }
        return GoogleCalendarEventsResult(events = events, warnings = warnings)
    }
}

private fun JSONObject.optStringOrNull(key: String): String? =
    if (has(key) && !isNull(key)) optString(key, null) else null
