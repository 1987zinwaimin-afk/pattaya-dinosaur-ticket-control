package com.pattayadinosaur.alarm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlin.math.PI
import kotlin.math.sin

/**
 * Native alarm receiver. The melody intentionally mirrors the existing website's
 * default bell: triangle-wave notes 880, 1175, 1568 Hz, with the same short cadence.
 * FCM delivery and device/OEM battery policies still determine background reachability.
 */
class AlarmMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        if (message.data["event_type"] != "emergency_alarm") return
        val prefs = getSharedPreferences("pdk_alarm", Context.MODE_PRIVATE)
        if (prefs.getString("role", "") !in setOf("owner", "staff")) return
        showAlarm(message.data["message"] ?: "Emergency alarm")
        playExistingBell()
    }

    override fun onNewToken(token: String) {
        // Token is queued locally until the authenticated app session registers it
        // through the protected Supabase Edge Function.
        getSharedPreferences("pdk_alarm", Context.MODE_PRIVATE)
            .edit().putString("pending_fcm_token", token).apply()
    }

    private fun showAlarm(body: String) {
        val manager = getSystemService(NotificationManager::class.java)
        val channelId = "pdk_emergency_alarm_v1"
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(
                channelId, "Emergency Alarm", NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Owner and Normal Staff emergency alarm"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 1000, 300, 1000, 300, 1500, 300, 1500)
                setSound(null, null) // melody is played by the native receiver
            }
            manager.createNotificationChannel(channel)
        }
        val open = PendingIntent.getActivity(
            this, 41, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("🚨 EMERGENCY ALARM")
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setOngoing(true)
            .setContentIntent(open)
            .build()
        manager.notify(4101, notification)
    }

    private fun playExistingBell() {
        val sampleRate = 44100
        val notes = listOf(880.0, 1175.0, 1568.0)
        val noteMs = 140
        val gapMs = 0
        val samplesPerNote = sampleRate * noteMs / 1000
        val all = ShortArray((samplesPerNote + gapMs * sampleRate / 1000) * notes.size)
        var offset = 0
        for (frequency in notes) {
            for (i in 0 until samplesPerNote) {
                val t = i.toDouble() / sampleRate
                val phase = (frequency * t) % 1.0
                val triangle = (4.0 * kotlin.math.abs(phase - 0.5) - 1.0)
                val envelope = minOf(1.0, i / 900.0, (samplesPerNote - i) / 1600.0).coerceAtLeast(0.0)
                all[offset++] = (triangle * envelope * 6500).toInt().toShort()
            }
        }
        try {
            val track = AudioTrack(
                AudioManager.STREAM_ALARM, sampleRate,
                AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT,
                all.size * 2, AudioTrack.MODE_STATIC
            )
            track.write(all, 0, all.size)
            track.setVolume(0.85f)
            track.play()
            track.setNotificationMarkerPosition(all.size)
            track.setPlaybackPositionUpdateListener(object : AudioTrack.OnPlaybackPositionUpdateListener {
                override fun onMarkerReached(track: AudioTrack) { track.release() }
                override fun onPeriodicNotification(track: AudioTrack) = Unit
            })
        } catch (_: Exception) {
            // Android may suppress alarm-stream audio under DND or device policy.
        }
    }
}
