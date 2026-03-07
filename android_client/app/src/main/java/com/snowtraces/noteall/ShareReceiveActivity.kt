package com.snowtraces.noteall

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.snowtraces.noteall.config.ConfigManager
import com.snowtraces.noteall.network.ApiClient
import com.snowtraces.noteall.network.TextUploadRequest
import com.snowtraces.noteall.ui.theme.NoteAllTheme
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.io.FileOutputStream

class ShareReceiveActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Make activity finish immediately after processing if possible,
        // but for now we show a BottomSheet-like UI or simple Dialog
        showShareUI(intent)
    }

    private fun showShareUI(intent: Intent) {
        setContent {
            NoteAllTheme {
                Surface(
                    color = MaterialTheme.colorScheme.background.copy(alpha = 0.5f), // Semi transparent
                    modifier = Modifier.fillMaxSize()
                ) {
                    var isUploading by remember { mutableStateOf(false) }
                    var message by remember { mutableStateOf("Ready to share to Note All") }

                    val scope = rememberCoroutineScope()
                    LaunchedEffect(Unit) {
                        isUploading = true
                        handleSendIntent(intent) { msg, success ->
                            message = msg
                            if (success) {
                                // Close after brief delay
                                scope.launch {
                                    kotlinx.coroutines.delay(1000)
                                    finish()
                                }
                            } else {
                                isUploading = false
                            }
                        }
                    }

                    Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                        Card(
                            modifier = Modifier.padding(16.dp).fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(message, style = MaterialTheme.typography.titleMedium)
                                Spacer(modifier = Modifier.height(16.dp))
                                if (isUploading) {
                                    CircularProgressIndicator()
                                } else {
                                    Button(onClick = { finish() }) {
                                        Text("Close")
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private suspend fun handleSendIntent(intent: Intent, onResult: (String, Boolean) -> Unit) {
        val action = intent.action
        val type = intent.type

        if (Intent.ACTION_SEND == action && type != null) {
            if ("text/plain" == type) {
                val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return onResult("No text found", false)
                uploadText(sharedText, onResult)
            } else if (type.startsWith("image/")) {
                val imageUri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM) ?: return onResult("No image found", false)
                uploadImage(imageUri, onResult)
            } else {
                onResult("Unsupported type: $type", false)
            }
        } else if (Intent.ACTION_SEND_MULTIPLE == action && type != null) {
            if (type.startsWith("image/")) {
                val imageUris = intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
                if (imageUris.isNullOrEmpty()) {
                    onResult("No images found", false)
                    return
                }
                
                var successCount = 0
                for ((index, uri) in imageUris.withIndex()) {
                    onResult("Uploading image ${index + 1}/${imageUris.size}...", false)
                    val success = uploadImageSuspend(uri)
                    if (success) {
                        successCount++
                    }
                }
                onResult("Uploaded $successCount/${imageUris.size} images successfully!", successCount == imageUris.size)
            } else {
                onResult("Unsupported type: $type", false)
            }
        } else {
            onResult("No content to share", false)
        }
    }

    private suspend fun uploadText(text: String, onResult: (String, Boolean) -> Unit) {
        withContext(Dispatchers.IO) {
            try {
                val configManager = ConfigManager(this@ShareReceiveActivity)
                val baseUrl = configManager.baseUrlFlow.first()
                val api = ApiClient.getApi(baseUrl)
                val response = api.uploadText(TextUploadRequest(text))
                withContext(Dispatchers.Main) {
                    onResult("Uploading text success!", true)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    onResult("Fail to upload: ${e.message}", false)
                }
            }
        }
    }

    private suspend fun uploadImage(uri: Uri, onResult: (String, Boolean) -> Unit) {
        val success = uploadImageSuspend(uri)
        if (success) {
            onResult("Uploading image success!", true)
        } else {
            onResult("Fail to upload image", false)
        }
    }

    private suspend fun uploadImageSuspend(uri: Uri): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                // Copy to temp file
                val tempFile = File(cacheDir, "share_temp_${System.currentTimeMillis()}.png")
                val inputStream = contentResolver.openInputStream(uri)
                val outputStream = FileOutputStream(tempFile)
                inputStream?.copyTo(outputStream)
                inputStream?.close()
                outputStream.close()

                val requestFile = tempFile.asRequestBody("image/*".toMediaTypeOrNull())
                val body = MultipartBody.Part.createFormData("file", tempFile.name, requestFile)
                
                val configManager = ConfigManager(this@ShareReceiveActivity)
                val baseUrl = configManager.baseUrlFlow.first()
                val api = ApiClient.getApi(baseUrl)
                
                api.uploadImage(body)
                tempFile.delete() // Clean up
                true
            } catch (e: Exception) {
                false
            }
        }
    }
}
