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
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.DismissDirection
import androidx.compose.material.DismissValue
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.FractionalThreshold
import androidx.compose.material.SwipeToDismiss
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.material.rememberDismissState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.snowtraces.noteall.config.ConfigManager
import com.snowtraces.noteall.data.NoteRepository
import com.snowtraces.noteall.model.AppView
import com.snowtraces.noteall.network.NoteItem
import com.snowtraces.noteall.ui.components.AddNoteDialog
import com.snowtraces.noteall.ui.components.NoteCard
import com.snowtraces.noteall.ui.components.FloatingBottomBar
import com.snowtraces.noteall.ui.screens.DetailScreen
import com.snowtraces.noteall.viewmodel.ChatViewModel
import com.snowtraces.noteall.ui.screens.ChatScreen
import com.snowtraces.noteall.ui.screens.ChatSessionsScreen
import com.snowtraces.noteall.ui.theme.NoteAllTheme
import com.snowtraces.noteall.viewmodel.NoteViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.io.FileOutputStream

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
    val repository = remember { NoteRepository() }
    val viewModel: NoteViewModel = remember { NoteViewModel(repository) }
    val chatViewModel: ChatViewModel = remember { ChatViewModel(repository) }
    
    val coroutineScope = rememberCoroutineScope()
    
    // Search State
    var isSearchingTitle by remember { mutableStateOf(false) }
    
    // Navigation State
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    
    val pullRefreshState = rememberPullRefreshState(
        refreshing = viewModel.isRefreshing,
        onRefresh = { viewModel.refresh(showIndicator = true) }
    )
    
    var selectedNote by remember { mutableStateOf<NoteItem?>(null) }
    
    // Clipboard State
    var clipboardText by remember { mutableStateOf<String?>(null) }
    val clipboardManager = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager

    // Settings Dialog State
    var showSettings by remember { mutableStateOf(false) }
    var tempUrl by remember { mutableStateOf("") }
    var tempToken by remember { mutableStateOf("") }
    var showAddNoteDialog by remember { mutableStateOf(false) }
    var noteToHardDelete by remember { mutableStateOf<NoteItem?>(null) }
    var activeSwipeNoteId by remember { mutableStateOf<Int?>(null) }
    var shareNoteId by remember { mutableStateOf<Int?>(null) }
    val snackbarHostState = remember { SnackbarHostState() }



    LaunchedEffect(Unit) {
        val savedBaseUrl = configManager.baseUrlFlow.first()
        val savedToken = configManager.authTokenFlow.first()
        val savedRawPassword = configManager.rawPasswordFlow.first()
        
        tempUrl = savedBaseUrl
        tempToken = savedRawPassword // UI 显示原始密码
        
        viewModel.baseUrl = savedBaseUrl
        chatViewModel.baseUrl = savedBaseUrl
        
        // 注入已保存的 JWT Token
        com.snowtraces.noteall.network.ApiClient.authToken = savedToken
        
        viewModel.refresh()
    }
    
    // Handle global back press for deep navigation
    BackHandler(enabled = viewModel.currentView != AppView.Home || selectedNote != null) {
        if (selectedNote != null) {
            selectedNote = null
        } else if (viewModel.currentView == AppView.Chat) {
            viewModel.setView(AppView.ChatSessions)
        } else {
            viewModel.setView(AppView.Home)
        }
    }

    // Data Poller Probe: Sync data every 5 seconds if in Home view
    // reference: frontend/src/hooks/useDataPoller.js
    LaunchedEffect(viewModel.baseUrl, viewModel.currentView, viewModel.searchQuery) {
        if (viewModel.baseUrl.isEmpty() || viewModel.currentView != AppView.Home) return@LaunchedEffect
        
        while (true) {
            kotlinx.coroutines.delay(10000)
            viewModel.syncNotes()
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
                    selected = viewModel.currentView == AppView.Home,
                    onClick = {
                        viewModel.setView(AppView.Home)
                        coroutineScope.launch { drawerState.close() }
                    },
                    icon = { Icon(Icons.Default.Home, contentDescription = null) },
                    modifier = Modifier.padding(horizontal = 12.dp),
                    shape = RoundedCornerShape(28.dp)
                )
                
                Spacer(modifier = Modifier.height(4.dp))
                
                NavigationDrawerItem(
                    label = { Text("智能交互问答", style = MaterialTheme.typography.labelLarge) },
                    selected = viewModel.currentView == AppView.Chat || viewModel.currentView == AppView.ChatSessions,
                    onClick = {
                        viewModel.setView(AppView.ChatSessions)
                        coroutineScope.launch { drawerState.close() }
                    },
                    icon = { Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                    modifier = Modifier.padding(horizontal = 12.dp),
                    shape = RoundedCornerShape(28.dp)
                )

                Spacer(modifier = Modifier.height(4.dp))
                
                NavigationDrawerItem(
                    label = { Text("回收站", style = MaterialTheme.typography.labelLarge) },
                    selected = viewModel.currentView == AppView.Trash,
                    onClick = {
                        viewModel.setView(AppView.Trash)
                        coroutineScope.launch { drawerState.close() }
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
        when {
            selectedNote != null -> {
                DetailScreen(
                    note = selectedNote!!, 
                    baseUrl = viewModel.baseUrl, 
                    onBack = { selectedNote = null },
                    onUpdateRaw = { id, newText ->
                        viewModel.updateNoteText(id, newText, 
                            onComplete = {
                                Toast.makeText(context, "更新成功，后台正重新学习此记录", Toast.LENGTH_LONG).show()
                                selectedNote = null
                            },
                            onError = { Toast.makeText(context, "Fail: $it", Toast.LENGTH_SHORT).show() }
                        )
                    },
                    onShareClick = {
                        shareNoteId = selectedNote!!.id
                    }
                )
            }
            viewModel.currentView == AppView.Chat -> {
                ChatScreen(
                    viewModel = chatViewModel,
                    onBack = { viewModel.setView(AppView.ChatSessions) },
                    onNavigateToNote = { note -> 
                        selectedNote = note
                    }
                )
            }
            viewModel.currentView == AppView.ChatSessions -> {
                ChatSessionsScreen(
                    viewModel = chatViewModel,
                    onBack = { viewModel.setView(AppView.Home) },
                    onSelectSession = { id ->
                        if (id == -1) {
                            chatViewModel.startNewChat()
                        } else {
                            chatViewModel.loadSession(id)
                        }
                        viewModel.setView(AppView.Chat)
                    }
                )
            }
            else -> {
            // --- MAIN LIST SCREEN ---
            Scaffold(
                containerColor = MaterialTheme.colorScheme.surfaceVariant,
                topBar = {
                    if (isSearchingTitle) {
                        TopAppBar(
                            title = {
                                TextField(
                                    value = viewModel.searchQuery,
                                    onValueChange = { viewModel.search(it) },
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
                                    viewModel.search("")
                                }) {
                                    Icon(Icons.Default.ArrowBack, contentDescription = "Close Search")
                                }
                            }
                        )
                    } else {
                        TopAppBar(
                            title = { 
                                Text(
                                    if (viewModel.currentView == AppView.Home) "Note All" else "回收站",
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
                                if (viewModel.currentView == AppView.Home) {
                                    IconButton(onClick = { isSearchingTitle = true }) {
                                        Icon(Icons.Default.Search, contentDescription = "Search")
                                    }
                                }
                            }
                        )
                    }
                },
                floatingActionButton = {
                    if (viewModel.currentView == AppView.Home) {
                        FloatingBottomBar(
                            onChatClick = { viewModel.setView(AppView.ChatSessions) },
                            onAddClick = {
                                if (viewModel.baseUrl.isNotEmpty()) {
                                    showAddNoteDialog = true 
                                } else {
                                    Toast.makeText(context, "请先在设置中配置后端地址", Toast.LENGTH_SHORT).show()
                                    showSettings = true
                                }
                            }
                        )
                    }
                },
                floatingActionButtonPosition = FabPosition.Center,
                snackbarHost = { SnackbarHost(snackbarHostState) }
            ) { padding ->
            Box(modifier = Modifier.padding(padding).fillMaxSize().pullRefresh(pullRefreshState)) {
                if (viewModel.isLoading && !viewModel.isRefreshing) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                } else if (viewModel.notes.isEmpty() && !viewModel.isLoading && !viewModel.isRefreshing) {
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        item {
                            Box(modifier = Modifier.fillParentMaxSize()) {
                                Text("这里空空如也，快去收集吧！", modifier = Modifier.align(Alignment.Center))
                            }
                        }
                    }
                } else {
                    LazyVerticalStaggeredGrid(
                        columns = StaggeredGridCells.Fixed(1),
                        contentPadding = PaddingValues(start = 8.dp, end = 8.dp, top = 8.dp, bottom = 80.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(viewModel.notes, key = { it.id }) { note ->
                            val dismissState = rememberDismissState(
                                confirmStateChange = {
                                    if (it == DismissValue.DismissedToStart) {
                                        if (note.id == activeSwipeNoteId) {
                                            if (viewModel.currentView == AppView.Trash) {
                                                noteToHardDelete = note
                                                false
                                            } else {
                                                viewModel.deleteNote(note, 
                                                    onComplete = {
                                                        coroutineScope.launch {
                                                            val result = snackbarHostState.showSnackbar(
                                                                message = "已移至回收站",
                                                                actionLabel = "撤销",
                                                                duration = SnackbarDuration.Short
                                                            )
                                                            if (result == SnackbarResult.ActionPerformed) {
                                                                viewModel.restoreNote(note.id, {}, {})
                                                            }
                                                        }
                                                    },
                                                    onError = { Toast.makeText(context, "操作失败: $it", Toast.LENGTH_SHORT).show() }
                                                )
                                                activeSwipeNoteId = null
                                                true
                                            }
                                        } else false
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
                                                imageVector = if (viewModel.currentView == AppView.Home) Icons.Default.Delete else Icons.Default.DeleteForever,
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
                                        if (viewModel.currentView == AppView.Trash) {
                                            IconButton(
                                                onClick = { viewModel.restoreNote(note.id, {}, {}) },
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
                    refreshing = viewModel.isRefreshing,
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
                                                repository.uploadText(viewModel.baseUrl, txt)
                                                Toast.makeText(context, "已成功收录到云端", Toast.LENGTH_SHORT).show()
                                                viewModel.refresh()
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
                    title = { 
                        Text(
                            "确认永久删除？", 
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold
                        ) 
                    },
                    text = { Text("这条笔记将从服务器彻底移除，无法恢复。") },
                    confirmButton = {
                        Button(
                            onClick = {
                                val note = noteToHardDelete ?: return@Button
                                noteToHardDelete = null
                                viewModel.deleteNote(note, 
                                    onComplete = { Toast.makeText(context, "已永久删除", Toast.LENGTH_SHORT).show() },
                                    onError = { Toast.makeText(context, "删除失败: $it", Toast.LENGTH_SHORT).show() }
                                )
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                            shape = RoundedCornerShape(12.dp)
                        ) { Text("确认删除") }
                    },
                    dismissButton = {
                        TextButton(onClick = { noteToHardDelete = null }) { Text("取消") }
                    },
                    shape = RoundedCornerShape(28.dp)
                )
            }

            // Settings Dialog
            if (showSettings) {
                AlertDialog(
                    onDismissRequest = { showSettings = false },
                    title = { 
                        Text(
                            "系统设置",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold
                        ) 
                    },
                    text = {
                        Column(modifier = Modifier.padding(top = 8.dp)) {
                            OutlinedTextField(
                                value = tempUrl,
                                onValueChange = { tempUrl = it },
                                label = { Text("后端服务器 (Base URL)") },
                                placeholder = { Text("http://your-ip:8080") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                                shape = RoundedCornerShape(12.dp)
                            )
                            
                            OutlinedTextField(
                                value = tempToken,
                                onValueChange = { tempToken = it },
                                label = { Text("系统访问密码") },
                                placeholder = { Text("sys_password") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp)
                            )
                        }
                    },
                    confirmButton = {
                        Button(
                            onClick = {
                                coroutineScope.launch {
                                    try {
                                        // 升级：登录换取 JWT
                                        val loginResp = repository.login(tempUrl, tempToken)
                                        val jwtToken = loginResp.token

                                        configManager.saveBaseUrl(tempUrl)
                                        configManager.saveAuthToken(jwtToken)
                                        configManager.saveRawPassword(tempToken)
                                        
                                        viewModel.baseUrl = tempUrl
                                        com.snowtraces.noteall.network.ApiClient.authToken = jwtToken
                                        
                                        showSettings = false
                                        viewModel.refresh(showIndicator = true)
                                        Toast.makeText(context, "配置成功并已签发令牌", Toast.LENGTH_SHORT).show()
                                    } catch (e: Exception) {
                                        Toast.makeText(context, "登录验证失败: ${e.message}", Toast.LENGTH_LONG).show()
                                    }
                                }
                            },
                        shape = RoundedCornerShape(12.dp)
                        ) {
                            Text("保存并加载")
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { showSettings = false }) { Text("取消") }
                    },
                    shape = RoundedCornerShape(28.dp)
                )
            }

            // Add Note Dialog
            if (showAddNoteDialog) {
                AddNoteDialog(
                    onDismissRequest = { showAddNoteDialog = false },
                    onUploadText = { txt ->
                        coroutineScope.launch {
                            try {
                                repository.uploadText(viewModel.baseUrl, txt)
                                Toast.makeText(context, "已收录文字", Toast.LENGTH_SHORT).show()
                                viewModel.refresh()
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
                                        val tempFile = File(
                                            context.cacheDir,
                                            "upload_temp_${System.currentTimeMillis()}_$index.png"
                                        )
                                        val inputStream = context.contentResolver.openInputStream(uri)
                                        val outputStream = FileOutputStream(tempFile)
                                        inputStream?.copyTo(outputStream)
                                        inputStream?.close()
                                        outputStream.close()

                                        val requestFile = tempFile.asRequestBody("image/*".toMediaTypeOrNull())
                                        val body = MultipartBody.Part.createFormData("file", tempFile.name, requestFile)
                                        
                                        repository.uploadImage(viewModel.baseUrl, body)
                                        tempFile.delete()
                                        
                                        withContext(Dispatchers.Main) {
                                            if (index == uris.size - 1) {
                                                Toast.makeText(context, "所有图片 (${uris.size}) 上传成功！", Toast.LENGTH_SHORT).show()
                                                viewModel.refresh()
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

        // Share Dialog (Moved outside when block to ensure it's on top of everything)
        if (shareNoteId != null) {
            com.snowtraces.noteall.ui.components.ShareDialog(
                noteId = shareNoteId!!,
                viewModel = viewModel,
                onDismissRequest = { shareNoteId = null }
            )
        }
    }
}



// Repository and ViewModel fetching functions moved to separate files
