package com.pattayadinosaur.printerbridge

import android.Manifest
import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import androidx.core.app.ActivityCompat
import java.io.OutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private val prefs by lazy { getSharedPreferences("pdk_printer", MODE_PRIVATE) }
    private val io = Executors.newSingleThreadExecutor()
    private val spp = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private lateinit var status: TextView
    private lateinit var spinner: Spinner
    private var devices: List<BluetoothDevice> = emptyList()
    private var pendingPrint: PrintJob? = null
    private var launchedFromWebsite = false
    private var permissionRequestInFlight = false

    data class PrintJob(val payload: String, val group: String, val people: Int, val entry: String)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildScreen()
        handlePrintIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handlePrintIntent(intent)
    }

    private fun buildScreen() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(28, 36, 28, 28)
            gravity = Gravity.CENTER_HORIZONTAL
        }
        val title = TextView(this).apply {
            text = "PATTAYA DINOSAUR KINGDOM\nQR PRINTER"
            textSize = 22f
            gravity = Gravity.CENTER
            setTextColor(0xff10243b.toInt())
        }
        status = TextView(this).apply {
            text = "Pair MP58-16 in Android Bluetooth settings, then select it below."
            textSize = 15f
            setPadding(0, 28, 0, 18)
        }
        spinner = Spinner(this)
        val refresh = Button(this).apply {
            text = "Find paired printers"
            setOnClickListener { loadPairedDevices() }
        }
        val save = Button(this).apply {
            text = "Save selected printer"
            setOnClickListener {
                val i = spinner.selectedItemPosition
                if (i in devices.indices) {
                    prefs.edit().putString("mac", devices[i].address).apply()
                    status.text = "Saved: ${devices[i].name ?: "Bluetooth printer"}\nReady for website QR printing."
                    pendingPrint?.let { job -> pendingPrint = null; printJob(job) }
                } else status.text = "Please select a paired printer."
            }
        }
        root.addView(title, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(status, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(spinner, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(refresh)
        root.addView(save)
        setContentView(root)
        loadPairedDevices()
    }

    private fun requestBluetoothPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 31 && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            if (!permissionRequestInFlight) { permissionRequestInFlight = true; ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.BLUETOOTH_CONNECT), 42) }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 42) permissionRequestInFlight = false
        if (requestCode == 42 && grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            loadPairedDevices()
            pendingPrint?.let { pendingPrint = null; printJob(it) }
        } else if (requestCode == 42) status.text = "Bluetooth permission is required to print."
    }

    @Suppress("MissingPermission")
    private fun loadPairedDevices() {
        try {
            val adapter = BluetoothAdapter.getDefaultAdapter()
            if (adapter == null) { status.text = "This phone has no Bluetooth adapter."; return }
            if (Build.VERSION.SDK_INT >= 31 && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                requestBluetoothPermissionIfNeeded(); return
            }
            devices = adapter.bondedDevices.orEmpty().sortedBy { it.name ?: it.address }
            val labels = devices.map { "${it.name ?: "Bluetooth printer"}  (${it.address})" }
            spinner.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, labels)
            val saved = prefs.getString("mac", "DC:0D:51:FB:1B:C2")
            val index = devices.indexOfFirst { it.address.equals(saved, true) }
            if (index >= 0) spinner.setSelection(index)
            status.text = if (devices.isEmpty()) "No paired devices. Pair MP58-16 in Bluetooth settings first." else "Found ${devices.size} paired device(s). Select MP58-16 and save."
        } catch (e: Exception) { status.text = "Bluetooth error: ${e.message}" }
    }

    private fun handlePrintIntent(intent: Intent?) {
        if (intent?.action != Intent.ACTION_VIEW) return
        val uri: Uri = intent.data ?: return
        launchedFromWebsite = true
        val payload = uri.getQueryParameter("payload") ?: return
        val group = uri.getQueryParameter("group") ?: "—"
        val people = uri.getQueryParameter("people")?.toIntOrNull() ?: 0
        val entry = uri.getQueryParameter("entry") ?: SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.ENGLISH).format(Date())
        val job = PrintJob(payload, group, people, entry)
        if (Build.VERSION.SDK_INT >= 31 && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            pendingPrint = job; requestBluetoothPermissionIfNeeded(); return
        }
        if (prefs.getString("mac", null).isNullOrBlank()) {
            pendingPrint = job
            status.text = "Select MP58-16 and tap Save selected printer to continue."
            loadPairedDevices()
        } else printJob(job)
    }

    @Suppress("MissingPermission")
    private fun printJob(job: PrintJob) {
        status.text = "Sending Group #${job.group} to MP58-16…"
        io.execute {
            var socket: BluetoothSocket? = null
            try {
                val adapter = BluetoothAdapter.getDefaultAdapter() ?: error("Bluetooth unavailable")
                val mac = prefs.getString("mac", "DC:0D:51:FB:1B:C2") ?: error("No printer selected")
                val device = adapter.getRemoteDevice(mac)
                socket = device.createRfcommSocketToServiceRecord(spp)
                adapter.cancelDiscovery()
                socket.connect()
                val out = socket.outputStream
                out.write(receiptBytes(job))
                out.flush()
                runOnUiThread { status.text = "✓ Group #${job.group} printed successfully."; if (launchedFromWebsite) Handler(Looper.getMainLooper()).postDelayed({ finish() }, 900) }
            } catch (e: Exception) {
                runOnUiThread { status.text = "Print failed: ${e.message}. Check MP58-16 is on and paired." }
            } finally {
                try { socket?.close() } catch (_: Exception) {}
            }
        }
    }

    private fun receiptBytes(job: PrintJob): ByteArray {
        val out = ArrayList<Byte>()
        fun bytes(vararg values: Int) { values.forEach { out.add(it.toByte()) } }
        fun text(value: String) { value.toByteArray(Charsets.US_ASCII).forEach { out.add(it) } }
        fun line(value: String = "") { text(value + "\\n") }
        fun fontB() { bytes(0x1b, 0x4d, 0x01); bytes(0x1b, 0x21, 0x00) }
        fun fontA() { bytes(0x1b, 0x4d, 0x00); bytes(0x1b, 0x21, 0x00) }

        bytes(0x1b, 0x40)                 // initialize printer
        bytes(0x1b, 0x61, 0x01)          // center all receipt content
        bytes(0x1b, 0x74, 0x00)          // default character table

        // Compact Font B keeps both brand lines on one centered line.
        fontB()
        bytes(0x1b, 0x45, 0x01)
        line("PATTAYA DINOSAUR KINGDOM")
        bytes(0x1b, 0x45, 0x00)
        line("CUSTOMER VISIT PASS")
        line()

        // Group number is prominent but stays within 58mm paper width.
        fontA()
        bytes(0x1b, 0x45, 0x01)
        bytes(0x1d, 0x21, 0x11)          // double width + height
        line("GROUP #${job.group}".take(15))
        bytes(0x1d, 0x21, 0x00)
        line()

        // Smaller native QR for a balanced 58mm receipt.
        printQr(out, job.payload)
        line()

        fontA()
        bytes(0x1b, 0x45, 0x01)
        bytes(0x1d, 0x21, 0x01)          // double height only
        line("${job.people} PEOPLE")
        bytes(0x1d, 0x21, 0x00)
        bytes(0x1b, 0x45, 0x00)
        line()

        // Font B allows the full entry date/time to remain on one line.
        fontB()
        val entry = job.entry.uppercase(Locale.ENGLISH).replace(",", "")
        line("ENTRY: $entry")
        line()
        line("SCAN QR AT EXIT")
        line("THANK YOU")
        line()
        bytes(0x1b, 0x64, 0x03)          // feed 3 lines for tearing
        return out.toByteArray()
    }

    private fun wrap(value: String, width: Int): List<String> {
        val words = value.split(Regex("\\s+"))
        val result = mutableListOf<String>()
        var current = ""
        for (word in words) {
            if (current.isNotEmpty() && current.length + 1 + word.length > width) {
                result.add(current); current = word
            } else current = if (current.isEmpty()) word else "$current $word"
        }
        if (current.isNotEmpty()) result.add(current)
        return result
    }

    private fun printQr(out: MutableList<Byte>, value: String) {
        fun cmd(vararg values: Int) { values.forEach { out.add(it.toByte()) } }
        val data = value.toByteArray(Charsets.UTF_8)
        cmd(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00) // QR model 2
        cmd(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x05)    // smaller module size for 58mm paper
        cmd(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31)    // ECC M
        val length = data.size + 3
        cmd(0x1d, 0x28, 0x6b, length and 0xff, (length shr 8) and 0xff, 0x31, 0x50, 0x30)
        data.forEach { out.add(it) }
        cmd(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30) // print QR
    }
}
