package com.pattayadinosaur.alarm

import android.Manifest
import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.*
import android.graphics.Color
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private val worker = Executors.newSingleThreadExecutor()
    private lateinit var status: TextView
    private lateinit var email: EditText
    private lateinit var password: EditText
    private lateinit var login: Button
    private lateinit var logout: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 100)

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
        status = TextView(this).apply {
            text = "Sign in with your existing Owner or Normal Staff account."
            textSize = 15f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(0, 24, 0, 24)
        }
        email = EditText(this).apply { hint = "Email"; setSingleLine(); setTextColor(Color.WHITE); setHintTextColor(0xffaab7c4.toInt()) }
        password = EditText(this).apply { hint = "Password"; inputType = 129; setSingleLine(); setTextColor(Color.WHITE); setHintTextColor(0xffaab7c4.toInt()) }
        login = Button(this).apply { text = "Sign in and enable alarm" }
        logout = Button(this).apply { text = "Sign out"; visibility = android.view.View.GONE }
        login.setOnClickListener { doLogin() }
        logout.setOnClickListener {
            worker.execute {
                SupabaseSession.signOut(this)
                runOnUiThread {
                    status.text = "Signed out"
                    logout.visibility = android.view.View.GONE
                    login.visibility = android.view.View.VISIBLE
                    email.visibility = android.view.View.VISIBLE
                    password.visibility = android.view.View.VISIBLE
                }
            }
        }
        listOf(heading, status, email, password, login, logout).forEach {
            root.addView(it, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = 12 })
        }
        setContentView(root)
        if (SupabaseSession.accessToken(this) != null) {
            email.visibility = android.view.View.GONE
            password.visibility = android.view.View.GONE
            login.visibility = android.view.View.GONE
            logout.visibility = android.view.View.VISIBLE
            status.text = "Signed in as ${SupabaseSession.role(this)}. Checking device registration…"
            registerDevice()
        }
    }

    private fun doLogin() {
        val user = email.text.toString().trim()
        val pass = password.text.toString()
        if (user.isBlank() || pass.isBlank()) { status.text = "Enter email and password"; return }
        login.isEnabled = false
        status.text = "Securely checking account…"
        worker.execute {
            try {
                val role = SupabaseSession.signIn(this, user, pass)
                runOnUiThread {
                    status.text = "Verified: ${role.uppercase()} account. Registering this device…"
                    email.visibility = android.view.View.GONE
                    password.visibility = android.view.View.GONE
                    login.visibility = android.view.View.GONE
                    logout.visibility = android.view.View.VISIBLE
                    registerDevice()
                }
            } catch (e: Exception) {
                runOnUiThread { status.text = "Sign-in failed: ${e.message}"; login.isEnabled = true }
            }
        }
    }

    private fun registerDevice() {
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            worker.execute {
                try {
                    SupabaseSession.registerFcmToken(this, token)
                    runOnUiThread { status.text = "Alarm device registered. Account: ${SupabaseSession.role(this)}" }
                } catch (e: Exception) {
                    runOnUiThread { status.text = "Device registration pending: ${e.message}" }
                }
            }
        }.addOnFailureListener { status.text = "Could not obtain Firebase device token: ${it.message}" }
    }

    override fun onDestroy() {
        worker.shutdown()
        super.onDestroy()
    }
}
