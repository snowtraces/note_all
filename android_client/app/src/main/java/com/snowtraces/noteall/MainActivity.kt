package com.snowtraces.noteall

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.foundation.BorderStroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.material.FractionalThreshold
import androidx.compose.material.rememberDismissState
import androidx.compose.material.SwipeToDismiss
import androidx.compose.material.DismissValue
import androidx.compose.material.DismissDirection
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Menu
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.snowtraces.noteall.config.ConfigManager
import com.snowtraces.noteall.network.ApiClient
import com.snowtraces.noteall.network.NoteItem
import com.snowtraces.noteall.network.TextUploadRequest
import com.snowtraces.noteall.ui.theme.NoteAllTheme
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.io.FileOutputStream
import io.noties.markwon.Markwon
import io.noties.markwon.ext.tables.TablePlugin
import io.noties.markwon.ext.strikethrough.StrikethroughPlugin
import io.noties.markwon.ext.tasklist.TaskListPlugin
// import io.noties.markwon.ext.latex.JLatexMathPlugin
import io.noties.markwon.inlineparser.MarkwonInlineParserPlugin
import io.noties.markwon.html.HtmlPlugin
import androidx.compose.ui.viewinterop.AndroidView
import android.widget.TextView
import androidx.compose.foundation.combinedClickable

enum class AppView { Home, Trash }

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

@OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterialApi::class, ExperimentalFoundationApi::class)
@Composable
fun MainApp() {
    val context = LocalContext.current
    val configManager = remember { ConfigManager(context) }
    var notes by remember { mutableStateOf<List<NoteItem>>(emptyList()) }
    var isLoading by remember { mutableStateOf(false) }
    var isRefreshing by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()
    var baseUrl by remember { mutableStateOf("") }
    
    // Search State
    var searchQuery by remember { mutableStateOf("") }
    var isSearchingTitle by remember { mutableStateOf(false) }
    
    // Navigation State
    var currentView by remember { mutableStateOf(AppView.Home) }
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    
    val pullRefreshState = rememberPullRefreshState(
        refreshing = isRefreshing,
        onRefresh = {
            if (baseUrl.isNotEmpty()) {
                isRefreshing = true
                coroutineScope.launch {
                    if (currentView == AppView.Home) {
                        fetchNotes(baseUrl, searchQuery) {
                            notes = it
                            isRefreshing = false
                        }
                    } else {
                        fetchTrash(baseUrl) {
                            notes = it
                            isRefreshing = false
                        }
                    }
                }
            }
        }
    )
    
    var selectedNote by remember { mutableStateOf<NoteItem?>(null) }
    
    // Clipboard State
    var clipboardText by remember { mutableStateOf<String?>(null) }
    val clipboardManager = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

    // Settings Dialog State
    var showSettings by remember { mutableStateOf(false) }
    var tempUrl by remember { mutableStateOf("") }
    var showAddNoteDialog by remember { mutableStateOf(false) }
    var noteToHardDelete by remember { mutableStateOf<NoteItem?>(null) }
    var activeSwipeNoteId by remember { mutableStateOf<Int?>(null) }
    val snackbarHostState = remember { SnackbarHostState() }

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

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(
                modifier = Modifier.width(300.dp)
            ) {
                // Header Space
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 28.dp, vertical = 32.dp)
                ) {
                    Text(
                        "Note All",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                
                Spacer(modifier = Modifier.height(8.dp))
                
                NavigationDrawerItem(
                    label = { Text("所有笔记", style = MaterialTheme.typography.labelLarge) },
                    selected = currentView == AppView.Home,
                    onClick = {
                        currentView = AppView.Home
                        coroutineScope.launch { 
                            drawerState.close() 
                            isLoading = true
                            fetchNotes(baseUrl, "") { notes = it; isLoading = false }
                        }
                    },
                    icon = { Icon(Icons.Default.Home, contentDescription = null) },
                    modifier = Modifier.padding(horizontal = 12.dp),
                    shape = RoundedCornerShape(28.dp)
                )
                
                Spacer(modifier = Modifier.height(4.dp))
                
                NavigationDrawerItem(
                    label = { Text("回收站", style = MaterialTheme.typography.labelLarge) },
                    selected = currentView == AppView.Trash,
                    onClick = {
                        currentView = AppView.Trash
                        coroutineScope.launch { 
                            drawerState.close() 
                            isLoading = true
                            fetchTrash(baseUrl) { notes = it; isLoading = false }
                        }
                    },
                    icon = { Icon(Icons.Default.Delete, contentDescription = null) },
                    modifier = Modifier.padding(horizontal = 12.dp),
                    shape = RoundedCornerShape(28.dp)
                )
                
                Spacer(modifier = Modifier.weight(1f))
                
                Divider(modifier = Modifier.padding(horizontal = 28.dp))
                
                NavigationDrawerItem(
                    label = { Text("系统设置", style = MaterialTheme.typography.labelLarge) },
                    selected = false,
                    onClick = {
                        coroutineScope.launch { drawerState.close() }
                        showSettings = true
                    },
                    icon = { Icon(Icons.Default.Settings, contentDescription = null) },
                    modifier = Modifier.padding(12.dp),
                    shape = RoundedCornerShape(28.dp)
                )
                Spacer(modifier = Modifier.height(16.dp))
            }
        }
    ) {
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
                            if (currentView == AppView.Home) {
                                fetchNotes(baseUrl, "") { notes = it; isLoading = false }
                            } else {
                                fetchTrash(baseUrl) { notes = it; isLoading = false }
                            }
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
                containerColor = MaterialTheme.colorScheme.surfaceVariant,
                topBar = {
                    if (isSearchingTitle) {
                        TopAppBar(
                            title = {
                                TextField(
                                    value = searchQuery,
                                    onValueChange = { 
                                        searchQuery = it
                                        coroutineScope.launch {
                                            fetchNotes(baseUrl, it) { notes = it; isLoading = false }
                                        }
                                    },
                                    placeholder = { Text("搜索您的记录...") },
                                    colors = TextFieldDefaults.textFieldColors(
                                        containerColor = Color.Transparent,
                                        focusedIndicatorColor = Color.Transparent,
                                        unfocusedIndicatorColor = Color.Transparent
                                    ),
                                    modifier = Modifier.fillMaxWidth(),
                                    singleLine = true
                                )
                            },
                            navigationIcon = {
                                IconButton(onClick = { 
                                    isSearchingTitle = false
                                    searchQuery = ""
                                    coroutineScope.launch {
                                        fetchNotes(baseUrl, "") { notes = it; isLoading = false }
                                    }
                                }) {
                                    Icon(Icons.Default.ArrowBack, contentDescription = "Close Search")
                                }
                            }
                        )
                    } else {
                        TopAppBar(
                            title = { 
                                Text(
                                    if (currentView == AppView.Home) "Note All" else "回收站",
                                    modifier = Modifier.clickable { 
                                        coroutineScope.launch { drawerState.open() }
                                    }
                                ) 
                            },
                            colors = TopAppBarDefaults.smallTopAppBarColors(
                                containerColor = MaterialTheme.colorScheme.surfaceVariant
                            ),
                            navigationIcon = {
                                IconButton(onClick = { coroutineScope.launch { drawerState.open() } }) {
                                    Icon(Icons.Default.Menu, contentDescription = "Menu")
                                }
                            },
                            actions = {
                                if (currentView == AppView.Home) {
                                    IconButton(onClick = { isSearchingTitle = true }) {
                                        Icon(Icons.Default.Search, contentDescription = "Search")
                                    }
                                }
                            }
                        )
                    }
                },
                floatingActionButton = {
                    if (currentView == AppView.Home) {
                        FloatingActionButton(onClick = { 
                            if (baseUrl.isNotEmpty()) {
                                showAddNoteDialog = true 
                            } else {
                                Toast.makeText(context, "请先在设置中配置后端地址", Toast.LENGTH_SHORT).show()
                                showSettings = true
                            }
                        }) {
                            Icon(Icons.Default.Add, contentDescription = "Add")
                        }
                    }
                },
                snackbarHost = { SnackbarHost(snackbarHostState) }
            ) { padding ->
            Box(modifier = Modifier.padding(padding).fillMaxSize().pullRefresh(pullRefreshState)) {
                if (isLoading && !isRefreshing) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                } else if (notes.isEmpty() && !isLoading && !isRefreshing) {
                    // Provide a scrollable state so the user can pull-to-refresh even when empty
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        item {
                            Box(modifier = Modifier.fillParentMaxSize()) {
                                Text("这里空空如也，快去收集吧！", modifier = Modifier.align(Alignment.Center))
                            }
                        }
                    }
                } else {
                    val deleteNote = { note: NoteItem ->
                        coroutineScope.launch {
                            try {
                                val api = ApiClient.getApi(baseUrl)
                                if (currentView == AppView.Home) {
                                    api.deleteNote(note.id)
                                    fetchNotes(baseUrl, searchQuery) { notes = it; isLoading = false }
                                    
                                    val result = snackbarHostState.showSnackbar(
                                        message = "已移至回收站",
                                        actionLabel = "撤销",
                                        duration = SnackbarDuration.Short
                                    )
                                    if (result == SnackbarResult.ActionPerformed) {
                                        api.restoreNote(note.id)
                                        fetchNotes(baseUrl, searchQuery) { notes = it; isLoading = false }
                                    }
                                } else {
                                    api.hardDeleteNote(note.id)
                                    Toast.makeText(context, "已永久删除", Toast.LENGTH_SHORT).show()
                                    fetchTrash(baseUrl) { notes = it; isLoading = false }
                                }
                            } catch (e: Exception) {
                                Toast.makeText(context, "操作失败: ${e.message}", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                    
                    val restoreNote = { noteId: Int ->
                        coroutineScope.launch {
                            try {
                                val api = ApiClient.getApi(baseUrl)
                                api.restoreNote(noteId)
                                Toast.makeText(context, "已还原", Toast.LENGTH_SHORT).show()
                                fetchTrash(baseUrl) { notes = it; isLoading = false }
                            } catch (e: Exception) {
                                Toast.makeText(context, "还原失败: ${e.message}", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }

                    LazyVerticalStaggeredGrid(
                        columns = StaggeredGridCells.Fixed(1),
                        contentPadding = PaddingValues(start = 8.dp, end = 8.dp, top = 8.dp, bottom = 80.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(notes, key = { it.id }) { note ->
                            val dismissState = rememberDismissState(
                                confirmStateChange = {
                                    if (it == DismissValue.DismissedToStart) {
                                        if (note.id == activeSwipeNoteId) {
                                            if (currentView == AppView.Trash) {
                                                noteToHardDelete = note
                                                false
                                            } else {
                                                deleteNote(note)
                                                activeSwipeNoteId = null
                                                true
                                            }
                                        } else {
                                            // Vibrate or show hint? Snap back for now.
                                            false 
                                        }
                                    } else false
                                }
                            )

                            SwipeToDismiss(
                                state = dismissState,
                                directions = setOf(DismissDirection.EndToStart),
                                dismissThresholds = { FractionalThreshold(0.5f) },
                                background = {
                                    val direction = dismissState.dismissDirection ?: return@SwipeToDismiss
                                    val progress = dismissState.progress.fraction
                                    val isUnlocked = note.id == activeSwipeNoteId
                                    
                                    val color = if (direction == DismissDirection.EndToStart && progress > 0.01f) {
                                        if (isUnlocked) Color.Red.copy(alpha = (progress * 0.8f).coerceIn(0f, 0.8f))
                                        else Color.Gray.copy(alpha = 0.2f)
                                    } else {
                                        Color.Transparent
                                    }
                                                  Box(
                                        modifier = Modifier
                                            .fillMaxSize()
                                            .padding(4.dp)
                                            .background(color, RoundedCornerShape(16.dp)),
                                        contentAlignment = Alignment.CenterEnd
                                    ) {
                                        if (isUnlocked) {
                                            Icon(
                                                imageVector = if (currentView == AppView.Home) Icons.Default.Delete else Icons.Default.DeleteForever,
                                                contentDescription = "Delete",
                                                tint = Color.White,
                                                modifier = Modifier.padding(end = 16.dp)
                                            )
                                        } else if (progress > 0.2f) {
                                            Text(
                                                "长按卡片以解锁删除",
                                                color = Color.White,
                                                modifier = Modifier.padding(end = 16.dp),
                                                style = MaterialTheme.typography.labelSmall
                                            )
                                        }
                                    }
                                },
                                dismissContent = {
                                    Box {
                                        NoteCard(
                                            note = note, 
                                            isUnlocked = note.id == activeSwipeNoteId,
                                            onClick = { 
                                                if (activeSwipeNoteId == note.id) activeSwipeNoteId = null
                                                else selectedNote = note 
                                            },
                                            onLongClick = {
                                                activeSwipeNoteId = if (activeSwipeNoteId == note.id) null else note.id
                                            }
                                        )
                                        if (currentView == AppView.Trash) {
                                            IconButton(
                                                onClick = { restoreNote(note.id) },
                                                modifier = Modifier.align(Alignment.TopEnd).padding(8.dp)
                                            ) {
                                                Icon(Icons.Default.Restore, contentDescription = "Restore", tint = MaterialTheme.colorScheme.primary)
                                            }
                                        }
                                    }
                                }
                            )
                        }
                    }
                }

                PullRefreshIndicator(
                    refreshing = isRefreshing,
                    state = pullRefreshState,
                    modifier = Modifier.align(Alignment.TopCenter)
                )

                // Clipboard Sneak Peek Panel (Collection Status Bar)
                if (clipboardText != null) {
                    Card(
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                            .fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.surface
                        ),
                        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Info, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("剪贴板检测", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(clipboardText!!, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                                TextButton(onClick = { clipboardText = null }) { Text("忽略") }
                                Spacer(modifier = Modifier.width(8.dp))
                                Button(
                                    onClick = {
                                        val txt = clipboardText!!
                                        clipboardText = null
                                        coroutineScope.launch {
                                            try {
                                                val api = ApiClient.getApi(baseUrl)
                                                api.uploadText(TextUploadRequest(txt))
                                                Toast.makeText(context, "已成功收录到云端", Toast.LENGTH_SHORT).show()
                                                fetchNotes(baseUrl, "") { notes = it; isLoading = false }
                                            } catch (e: Exception) {
                                                Toast.makeText(context, "收录失败: ${e.message}", Toast.LENGTH_SHORT).show()
                                            }
                                        }
                                    },
                                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 0.dp),
                                    modifier = Modifier.height(32.dp),
                                    shape = RoundedCornerShape(8.dp)
                                ) { 
                                    Text("一键收录", style = MaterialTheme.typography.labelLarge) 
                                }
                            }
                        }
                    }
                }
                }
            }
            
            // Hard Delete Confirmation Dialog
            if (noteToHardDelete != null) {
                AlertDialog(
                    onDismissRequest = { noteToHardDelete = null },
                    icon = { Icon(Icons.Default.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
                    title = { Text("确认永久删除？") },
                    text = { Text("这条笔记将从服务器彻底移除，无法恢复。") },
                    confirmButton = {
                        Button(
                            onClick = {
                                val id = noteToHardDelete?.id ?: return@Button
                                noteToHardDelete = null
                                coroutineScope.launch {
                                    try {
                                        val api = ApiClient.getApi(baseUrl)
                                        api.hardDeleteNote(id)
                                        Toast.makeText(context, "已永久删除", Toast.LENGTH_SHORT).show()
                                        fetchTrash(baseUrl) { notes = it; isLoading = false }
                                    } catch (e: Exception) {
                                        Toast.makeText(context, "删除失败: ${e.message}", Toast.LENGTH_SHORT).show()
                                    }
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                        ) { Text("确认删除") }
                    },
                    dismissButton = {
                        TextButton(onClick = { noteToHardDelete = null }) { Text("取消") }
                    }
                )
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

            // Add Note Dialog
            if (showAddNoteDialog) {
                AddNoteDialog(
                    onDismissRequest = { showAddNoteDialog = false },
                    onUploadText = { txt ->
                        coroutineScope.launch {
                            try {
                                val api = ApiClient.getApi(baseUrl)
                                api.uploadText(TextUploadRequest(txt))
                                Toast.makeText(context, "已收录文字", Toast.LENGTH_SHORT).show()
                                fetchNotes(baseUrl, "") { notes = it; isLoading = false }
                            } catch (e: Exception) {
                                Toast.makeText(context, "收录失败: ${e.message}", Toast.LENGTH_LONG).show()
                            }
                        }
                    },
                    onUploadImages = { uris ->
                        coroutineScope.launch {
                            uris.forEachIndexed { index, uri ->
                                withContext(Dispatchers.IO) {
                                    try {
                                        val tempFile = File(context.cacheDir, "upload_temp_${System.currentTimeMillis()}_$index.png")
                                        val inputStream = context.contentResolver.openInputStream(uri)
                                        val outputStream = FileOutputStream(tempFile)
                                        inputStream?.copyTo(outputStream)
                                        inputStream?.close()
                                        outputStream.close()

                                        val requestFile = tempFile.asRequestBody("image/*".toMediaTypeOrNull())
                                        val body = MultipartBody.Part.createFormData("file", tempFile.name, requestFile)
                                        
                                        val api = ApiClient.getApi(baseUrl)
                                        api.uploadImage(body)
                                        tempFile.delete()
                                        
                                        withContext(Dispatchers.Main) {
                                            if (index == uris.size - 1) {
                                                Toast.makeText(context, "所有图片 (${uris.size}) 上传成功！", Toast.LENGTH_SHORT).show()
                                                fetchNotes(baseUrl, "") { notes = it; isLoading = false }
                                            }
                                        }
                                    } catch (e: Exception) {
                                        withContext(Dispatchers.Main) {
                                            Toast.makeText(context, "第 ${index + 1} 张图片上传失败: ${e.message}", Toast.LENGTH_LONG).show()
                                        }
                                    }
                                }
                            }
                        }
                    }
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddNoteDialog(
    onDismissRequest: () -> Unit,
    onUploadText: (String) -> Unit,
    onUploadImages: (List<Uri>) -> Unit
) {
    var text by remember { mutableStateOf("") }
    val imagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetMultipleContents()
    ) { uris: List<Uri> ->
        if (uris.isNotEmpty()) {
            onUploadImages(uris)
            onDismissRequest()
        }
    }

    AlertDialog(
        onDismissRequest = onDismissRequest,
        title = {
            Text(
                "添加记录",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
            )
        },
        text = {
            Column(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                OutlinedTextField(
                    value = text,
                    onValueChange = { text = it },
                    label = { Text("输入或粘贴文本内容...") },
                    placeholder = { Text("想写点什么？") },
                    modifier = Modifier.fillMaxWidth().height(150.dp),
                    shape = RoundedCornerShape(12.dp)
                )
                Spacer(modifier = Modifier.height(20.dp))
                Button(
                    onClick = { imagePickerLauncher.launch("image/*") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.secondaryContainer,
                        contentColor = MaterialTheme.colorScheme.onSecondaryContainer
                    )
                ) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("从相册选择图片")
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (text.isNotBlank()) {
                        onUploadText(text)
                        onDismissRequest()
                    }
                },
                enabled = text.isNotBlank(),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text("收录文本")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismissRequest) { Text("取消") }
        },
        shape = RoundedCornerShape(28.dp)
    )
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun NoteCard(note: NoteItem, isUnlocked: Boolean = false, onClick: () -> Unit, onLongClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(4.dp)
            .combinedClickable(
                onClick = onClick,
                onLongClick = onLongClick
            ),
        elevation = CardDefaults.cardElevation(defaultElevation = if (isUnlocked) 8.dp else 2.dp),
        border = if (isUnlocked) BorderStroke(2.dp, MaterialTheme.colorScheme.error) else null,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column {
            Column(modifier = Modifier.padding(16.dp)) {
                val rawText = if (!note.aiSummary.isNullOrEmpty()) note.aiSummary else (note.ocrText ?: "无附加文案")
                val lines = rawText.trim().split("\n")
                val title = lines.firstOrNull() ?: ""
                val body = if (lines.size > 1) lines.drop(1).joinToString("\n").trim() else ""

                if (title.isNotEmpty()) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                }
                
                if (body.isNotEmpty()) {
                    Text(
                        text = body,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 6,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                } else if (title.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(8.dp))
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val dateStr = note.createdAt ?: ""
                    val displayDate = try {
                        if (dateStr.length >= 10) {
                            val parts = dateStr.substring(0, 10).split("-")
                            if (parts.size >= 3) {
                                "${parts[1].toInt()}月${parts[2].toInt()}日"
                            } else dateStr.take(10)
                        } else dateStr
                    } catch (e: Exception) {
                        dateStr.take(10)
                    }

                    Text(
                        text = displayDate,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                        modifier = Modifier.padding(end = 8.dp)
                    )

                    // Tags Area: Clips trailing tags that don't fit
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .padding(end = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        if (!note.aiTags.isNullOrEmpty()) {
                            note.aiTags.split(",").filter { it.isNotBlank() }.take(5).forEach { tag ->
                                Surface(
                                    color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.4f),
                                    shape = RoundedCornerShape(4.dp)
                                ) {
                                    Text(
                                        text = tag.trim(),
                                        style = MaterialTheme.typography.labelSmall,
                                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp),
                                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                                        maxLines = 1
                                    )
                                }
                            }
                        }
                    }
                    
                    if (!note.status.isNullOrEmpty()) {
                        val statusColor = when(note.status) {
                            "analyzed" -> Color(0xFF4CAF50) // Green
                            "processing" -> Color(0xFFFFA500) // Orange
                            "error" -> MaterialTheme.colorScheme.error
                            "pending" -> Color.Gray
                            else -> MaterialTheme.colorScheme.primary
                        }
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .background(color = statusColor, shape = CircleShape)
                        )
                    }
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
                // Markdown (Reliable Android rendering)
                MarkdownDisplay(content = note.aiSummary ?: "尚无提炼 (可能正在处理中或文本太短)", isPrimary = true)
                
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

                Text("文本溯源内容", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.secondary)
                Spacer(modifier = Modifier.height(8.dp))
                MarkdownDisplay(content = note.ocrText ?: "空文本", isPrimary = false)
            }
        }
    }
}

@Composable
fun MarkdownDisplay(content: String, isPrimary: Boolean) {
    val context = LocalContext.current
    val textSize = if (isPrimary) 16f else 14f

    val markwon = remember(textSize) { 
        Markwon.builder(context)
            .usePlugin(MarkwonInlineParserPlugin.create())
            .usePlugin(TablePlugin.create(context))
            .usePlugin(StrikethroughPlugin.create())
            .usePlugin(TaskListPlugin.create(context))
            .usePlugin(HtmlPlugin.create())
            .build()
    }
    val textColor = if (isPrimary) {
        MaterialTheme.colorScheme.onSurface
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant
    }

    AndroidView(
        factory = { ctx ->
            TextView(ctx).apply {
                this.setTextColor(textColor.toArgb())
                this.textSize = textSize
            }
        },
        update = { textView ->
            markwon.setMarkdown(textView, content)
        },
        modifier = Modifier.fillMaxWidth()
    )
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

private suspend fun fetchTrash(baseUrl: String, onResult: (List<NoteItem>) -> Unit) {
    try {
        val api = ApiClient.getApi(baseUrl)
        val response = api.getTrash()
        onResult(response.data ?: emptyList())
    } catch (e: Exception) {
        Log.e("NoteAll", "Fetch Trash Error", e)
        onResult(emptyList())
    }
}
