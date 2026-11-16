package com.pattayadinosaur.alarm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.os.Build
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Receives high-priority FCM data messages for the separate Android companion app.
 * Notification itself is silent; the only audible alert is one Thai TTS announcement.
 */
class AlarmMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        if (message.data["event_type"] != "emergency_alarm") return
        val prefs = getSharedPreferences("pdk_alarm", Context.MODE_PRIVATE)
        if (prefs.getString("role", "") !in setOf("owner", "staff")) return

        val thaiText = message.data["thai_text"]?.takeIf { it.isNotBlank() }
            ?: "เฮียเข้าไปในสวนแล้ว"
        val englishText = message.data["message"]?.takeIf { it.isNotBlank() }
            ?: "The boss has entered the park."
        showSilentAlarm(englishText)
        speakThaiOnce(thaiText)
    }

    override fun onNewToken(token: String) {
        getSharedPreferences("pdk_alarm", Context.MODE_PRIVATE)
            .edit().putString("pending_fcm_token", token).apply()
    }

    private fun showSilentAlarm(body: String) {
        val manager = getSystemService(NotificationManager::class.java)
        val channelId = "pdk_thai_voice_alarm_v2"
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(
                channelId, "Alarm (Thai voice only)", NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Silent notification; Thai voice announcement is played by the app"
                setSound(null, null)
                enableVibration(false)
                vibrationPattern = longArrayOf(0)
                setShowBadge(true)
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
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setSilent(true)
            .setVibrate(longArrayOf(0))
            .setContentIntent(open)
            .build()
        manager.notify(4101, notification)
    }

    private fun speakThaiOnce(text: String) {
        val initialized = CountDownLatch(1)
        val completed = CountDownLatch(1)
        var engine: TextToSpeech? = null
        var initStatus = TextToSpeech.ERROR

        try {
            engine = TextToSpeech(applicationContext) { status ->
                initStatus = status
                initialized.countDown()
            }
            if (!initialized.await(6, TimeUnit.SECONDS) || initStatus != TextToSpeech.SUCCESS) return

            val tts = engine
            tts.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )

            val thaiVoices = tts.voices?.filter { it.locale.language.equals("th", true) }.orEmpty()
            if (thaiVoices.isEmpty()) return

            // Android does not expose a dependable gender flag for every TTS voice.
            // Prefer voices whose installed engine names identify a female voice.
            val femaleHints = Regex("female|woman|kanya|pim|arisa|thailand.*f", RegexOption.IGNORE_CASE)
            val selected = thaiVoices.sortedByDescending { femaleHints.containsMatchIn(it.name) }.first()
            tts.voice = selected
            tts.language = Locale.forLanguageTag("th-TH")
            tts.setSpeechRate(0.88f)
            tts.setPitch(1.12f)
            tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) = Unit
                override fun onDone(utteranceId: String?) { completed.countDown() }
                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) { completed.countDown() }
                override fun onError(utteranceId: String?, errorCode: Int) { completed.countDown() }
            })
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "pdk-thai-emergency-once")
            completed.await(8, TimeUnit.SECONDS)
        } catch (_: Exception) {
            // No fallback notification tone: the requested alert is Thai voice only.
        } finally {
            try { engine?.stop(); engine?.shutdown() } catch (_: Exception) {}
        }
    }
}
