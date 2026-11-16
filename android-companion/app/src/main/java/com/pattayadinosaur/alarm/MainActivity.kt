package com.pattayadinosaur.alarm

import android.Manifest
import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.graphics.Color
import android.view.Gravity
import android.view.ViewGroup
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = getSharedPreferences("pdk_alarm", MODE_PRIVATE)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(28, 32, 28, 32)
            setBackgroundColor(Color.rgb(7, 26, 43))
        }
        val heading = TextView(this).apply {
            text = "PATTAYA DINOSAUR KINGDOM\nEmergency Alarm"
            textSize = 24f
            setTextColor(Color.rgb(230, 198, 126))
            gravity = Gravity.CENTER
        }
        val status = TextView(this).apply {
            text = "Secure companion service\nConnect using your existing Owner or Normal Staff account."
            textSize = 16f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(0, 24, 0, 24)
        }
        val request = Button(this).apply {
            text = "Enable alarm notifications"
            setOnClickListener {
                if (Build.VERSION.SDK_INT >= 33 &&
                    ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                ) {
                    ActivityCompat.requestPermissions(this@MainActivity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 100)
                }
                FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
                    prefs.edit().putString("pending_fcm_token", token).apply()
                    status.text = "Device token prepared. Sign-in and secure server registration are the next setup step."
                }.addOnFailureListener { status.text = "Could not prepare notifications: ${it.message}" }
            }
        }
        root.addView(heading, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(status, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(request)
        setContentView(root)
    }
}
