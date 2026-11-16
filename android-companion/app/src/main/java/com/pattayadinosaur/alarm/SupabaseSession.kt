package com.pattayadinosaur.alarm

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

internal object SupabaseSession {
    private const val BASE = "https://tlefnqzpilajeuyysujb.supabase.co"
    private const val ANON = "sb_publishable_7A7k-Dh3I7r3Gxk7EaakOQ_GLDon5wm"

    private fun prefs(context: Context) = EncryptedSharedPreferences.create(
        context, "pdk_secure_session",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun accessToken(context: Context) = prefs(context).getString("access_token", null)
    fun userId(context: Context) = prefs(context).getString("user_id", null)
    fun role(context: Context) = prefs(context).getString("role", null)

    fun signIn(context: Context, email: String, password: String): String {
        val auth = request(
            "POST", "/auth/v1/token?grant_type=password",
            JSONObject().put("email", email).put("password", password).toString(), null
        )
        val access = auth.getString("access_token")
        val uid = auth.getJSONObject("user").getString("id")

        val profileRows = requestArray("GET", "/rest/v1/profiles?id=eq.$uid&select=role,is_archived", null, access)
        if (profileRows.length() == 0) error("Account profile not found")
        val profile = profileRows.getJSONObject(0)
        val role = profile.optString("role")
        if (profile.optBoolean("is_archived", false) || role !in setOf("owner", "staff")) {
            error("Only active Owner or Normal Staff accounts can use this alarm app")
        }

        val eventRows = requestArray("GET", "/rest/v1/event_staff_accounts?auth_user_id=eq.$uid&select=event_staff_id", null, access)
        if (eventRows.length() > 0) error("Event Staff accounts are not eligible for emergency alarms")

        prefs(context).edit()
            .putString("access_token", access)
            .putString("refresh_token", auth.optString("refresh_token"))
            .putString("user_id", uid)
            .putString("role", role)
            .apply()
        // The native FCM receiver reads this small eligibility flag. Keep it in
        // sync only after the server-side profile and Event Staff checks pass.
        context.getSharedPreferences("pdk_alarm", Context.MODE_PRIVATE)
            .edit().putString("role", role).apply()
        return role
    }

    fun registerFcmToken(context: Context, token: String) {
        val access = accessToken(context) ?: error("Please sign in first")
        val payload = JSONObject()
            .put("action", "register_android_fcm")
            .put("fcm_token", token)
            .put("device_label", android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL)
        request(
            "POST", "/functions/v1/android-alarm",
            payload.toString(), access
        )
        context.getSharedPreferences("pdk_alarm", Context.MODE_PRIVATE)
            .edit().putString("pending_fcm_token", token).apply()
    }

    fun signOut(context: Context) {
        val access = accessToken(context)
        val token = context.getSharedPreferences("pdk_alarm", Context.MODE_PRIVATE)
            .getString("pending_fcm_token", null)
        // Remove this device's subscription before ending the authenticated session.
        if (access != null && token != null) {
            try {
                request(
                    "DELETE",
                    "/rest/v1/android_alarm_device_tokens?fcm_token=eq.${java.net.URLEncoder.encode(token, "UTF-8")}",
                    null, access
                )
            } catch (_: Exception) { /* server-side expiry cleanup remains possible */ }
        }
        if (access != null) try { request("POST", "/auth/v1/logout", "{}", access) } catch (_: Exception) {}
        prefs(context).edit().clear().apply()
        context.getSharedPreferences("pdk_alarm", Context.MODE_PRIVATE).edit().clear().apply()
    }

    private fun requestArray(method: String, path: String, body: String?, bearer: String) =
        org.json.JSONArray(requestRaw(method, path, body, bearer, emptyMap()))

    private fun request(method: String, path: String, body: String?, bearer: String?, extra: Map<String,String> = emptyMap()) =
        JSONObject(requestRaw(method, path, body, bearer, extra).ifBlank { "{}" })

    private fun requestRaw(method: String, path: String, body: String?, bearer: String?, extra: Map<String,String> = emptyMap()): String {
        val connection = (URL(BASE + path).openConnection() as HttpURLConnection)
        connection.requestMethod = method
        connection.connectTimeout = 15000
        connection.readTimeout = 15000
        connection.setRequestProperty("apikey", ANON)
        connection.setRequestProperty("Content-Type", "application/json")
        if (bearer != null) connection.setRequestProperty("Authorization", "Bearer $bearer")
        extra.forEach { (k,v) -> connection.setRequestProperty(k,v) }
        if (body != null) {
            connection.doOutput = true
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        }
        val code = connection.responseCode
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        val result = stream?.bufferedReader()?.use { it.readText() } ?: ""
        connection.disconnect()
        if (code !in 200..299) {
            val message = try { JSONObject(result).optString("message").ifBlank { JSONObject(result).optString("msg") } } catch (_: Exception) { result }
            error(message.ifBlank { "Server request failed ($code)" })
        }
        return result
    }
}
