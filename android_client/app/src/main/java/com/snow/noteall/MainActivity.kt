package com.snow.noteall

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.snow.noteall.config.ConfigManager
import com.snow.noteall.network.ApiClient
import com.snow.noteall.network.NoteItem
import com.snow.noteall.network.TextUploadRequest
import com.snow.noteall.ui.theme.NoteAllTheme
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            NoteAllTheme {
                MainApp()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainApp() {
    val context = LocalContext.current
    val configManager = remember { ConfigManager(context) }
    var notes by remember { mutableStateOf<List<NoteItem>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()
    var baseUrl by remember { mutableStateOf("") }
    
    var selectedNote by remember { mutableStateOf<NoteItem?>(null) }
    
    // Clipboard State
    var clipboardText by remember { mutableStateOf<String?>(null) }
    val clipboardManager = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

    // Settings Dialog State
    var showSettings by remember { mutableStateOf(false) }
    var tempUrl by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        baseUrl = configManager.baseUrlFlow.first()
        tempUrl = baseUrl
        if (baseUrl.isNotEmpty()) {
            isLoading = true
            fetchNotes(baseUrl, "") { notes = it; isLoading = false }
        }
    }

    // A very basic clipboard sniffing on resume
    DisposableEffect(Unit) {
        val listener = ClipboardManager.OnPrimaryClipChangedListener {
            val clipData: ClipData? = clipboardManager.primaryClip
            if (clipData != null && clipData.itemCount > 0) {
                val text = clipData.getItemAt(0).text?.toString()
                if (!text.isNullOrBlank()) {
                    clipboardText = text
                }
            }
        }
        clipboardManager.addPrimaryClipChangedListener(listener)
        onDispose {
            clipboardManager.removePrimaryClipChangedListener(listener)
        }
    }

    if (selectedNote != null) {
        // --- DETAIL & RAW MODE SCREEN ---
        BackHandler { selectedNote = null }
        DetailScreen(
            note = selectedNote!!, 
            baseUrl = baseUrl, 
            onBack = { selectedNote = null },
            onUpdateRaw = { id, newText ->
                coroutineScope.launch {
                    try {
                        val api = ApiClient.getApi(baseUrl)
                        api.updateNoteText(id, TextUploadRequest(newText))
                        Toast.makeText(context, "更新成功，后台正重新学习此记录", Toast.LENGTH_LONG).show()
                        fetchNotes(baseUrl, "") { notes = it; isLoading = false }
                        selectedNote = null // Go back to list
                    } catch (e: Exception) {
                        Toast.makeText(context, "Fail: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        )
    } else {
        // --- MAIN LIST SCREEN ---
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("Note All") },
                    actions = {
                        IconButton(onClick = { showSettings = true }) {
                            Icon(Icons.Default.Settings, contentDescription = "Settings")
                        }
                    }
                )
            },
            floatingActionButton = {
                FloatingActionButton(onClick = { /* TODO: Open TextInputDialog or Image Picker */ }) {
                    Icon(Icons.Default.Add, contentDescription = "Add")
                }
            }
        ) { padding ->
            Box(modifier = Modifier.padding(padding).fillMaxSize()) {
                if (isLoading) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                } else if (notes.isEmpty()) {
                    Text("这里空空如也，快去收集吧！", modifier = Modifier.align(Alignment.Center))
                } else {
                    LazyColumn(
                        contentPadding = PaddingValues(bottom = 80.dp)
                    ) {
                        items(notes) { note ->
                            NoteCard(note, baseUrl, onClick = { selectedNote = note })
                        }
                    }
                }

                // Clipboard Sneak Peek Panel
                if (clipboardText != null) {
                    Card(
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(16.dp)
                            .fillMaxWidth(),
                        elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text("系统检测到您复制了新内容：", style = MaterialTheme.typography.titleMedium)
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(clipboardText!!, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
                            Spacer(modifier = Modifier.height(16.dp))
                            Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                                TextButton(onClick = { clipboardText = null }) { Text("忽略") }
                                Spacer(modifier = Modifier.width(8.dp))
                                Button(onClick = {
                                    val txt = clipboardText!!
                                    clipboardText = null
                                    coroutineScope.launch {
                                        try {
                                            val api = ApiClient.getApi(baseUrl)
                                            api.uploadText(TextUploadRequest(txt))
                                            Toast.makeText(context, "Saved!", Toast.LENGTH_SHORT).show()
                                            fetchNotes(baseUrl, "") { notes = it; isLoading = false }
                                        } catch (e: Exception) {
                                            Toast.makeText(context, "Failed: ${e.message}", Toast.LENGTH_SHORT).show()
                                        }
                                    }
                                }) { Text("一键收录") }
                            }
                        }
                    }
                }
            }
            
            // Settings Dialog
            if (showSettings) {
                AlertDialog(
                    onDismissRequest = { showSettings = false },
                    title = { Text("系统设置") },
                    text = {
                        TextField(
                            value = tempUrl,
                            onValueChange = { tempUrl = it },
                            label = { Text("后端服务器 (Base URL)") },
                            singleLine = true
                        )
                    },
                    confirmButton = {
                        Button(onClick = {
                            coroutineScope.launch {
                                configManager.saveBaseUrl(tempUrl)
                                baseUrl = tempUrl
                                showSettings = false
                                isLoading = true
                                fetchNotes(baseUrl, "") { notes = it; isLoading = false }
                            }
                        }) {
                            Text("保存并加载")
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { showSettings = false }) { Text("取消") }
                    }
                )
            }
        }
    }
}

@Composable
fun NoteCard(note: NoteItem, baseUrl: String, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clickable(onClick = onClick),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            if (note.fileType?.startsWith("image/") == true && baseUrl.isNotEmpty()) {
                val imgUrl = "$baseUrl/api/file/${note.storageId}"
                AsyncImage(
                    model = imgUrl,
                    contentDescription = note.originalName,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(160.dp)
                )
                Spacer(modifier = Modifier.height(12.dp))
            }
            
            val contentText = if (!note.aiSummary.isNullOrEmpty()) note.aiSummary else (note.ocrText ?: "Empty Note")
            Text(
                text = contentText,
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "Status: ${note.status ?: "ok"}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.secondary
                )
                if (!note.aiTags.isNullOrEmpty()) {
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "• ${note.aiTags}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DetailScreen(note: NoteItem, baseUrl: String, onBack: () -> Unit, onUpdateRaw: (Int, String) -> Unit) {
    var rawMode by remember { mutableStateOf(false) }
    var editableText by remember { mutableStateOf(note.ocrText ?: "") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (rawMode) "RAW 模式" else "收集详情") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (rawMode) {
                        TextButton(onClick = { onUpdateRaw(note.id, editableText) }) {
                            Text("SAVE", color = MaterialTheme.colorScheme.primary)
                        }
                    } else {
                        IconButton(onClick = { rawMode = true }) {
                            Icon(Icons.Default.Edit, contentDescription = "Edit RAW")
                        }
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            if (note.fileType?.startsWith("image/") == true && baseUrl.isNotEmpty()) {
                val imgUrl = "$baseUrl/api/file/${note.storageId}"
                AsyncImage(
                    model = imgUrl,
                    contentDescription = note.originalName,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 200.dp, max = 400.dp) // Auto shrink/expand
                )
                Spacer(modifier = Modifier.height(16.dp))
            }

            if (rawMode) {
                // RAW 文本编辑器
                OutlinedTextField(
                    value = editableText,
                    onValueChange = { editableText = it },
                    label = { Text("底层提取文本 (修改以更新 AI)") },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 300.dp)
                )
            } else {
                // 读取模式
                Text("AI 摘要", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = note.aiSummary ?: "尚无提炼 (可能正在处理中或文本太短)",
                    style = MaterialTheme.typography.bodyLarge
                )
                
                Spacer(modifier = Modifier.height(16.dp))
                
                Text("自动化标签", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = note.aiTags ?: "无标签",
                    style = MaterialTheme.typography.bodyMedium
                )

                Spacer(modifier = Modifier.height(24.dp))
                Divider()
                Spacer(modifier = Modifier.height(16.dp))

                Text("底层纯文本溯源 (RAW)", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.secondary)
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = note.ocrText ?: "空文本",
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }
    }
}

private suspend fun fetchNotes(baseUrl: String, query: String, onResult: (List<NoteItem>) -> Unit) {
    try {
        val api = ApiClient.getApi(baseUrl)
        val response = api.searchNotes(query)
        onResult(response.data ?: emptyList())
    } catch (e: Exception) {
        Log.e("NoteAll", "Fetch Notes Error", e)
        onResult(emptyList()) // Provide fallback empty UI rather than crash
    }
}
