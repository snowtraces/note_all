package com.snowtraces.noteall.ui.screens

import android.widget.TextView
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import coil.compose.AsyncImage
import com.snowtraces.noteall.network.NoteItem
import io.noties.markwon.Markwon
import io.noties.markwon.ext.strikethrough.StrikethroughPlugin
import io.noties.markwon.ext.tables.TablePlugin
import io.noties.markwon.ext.tasklist.TaskListPlugin
import io.noties.markwon.html.HtmlPlugin
import io.noties.markwon.inlineparser.MarkwonInlineParserPlugin

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
                
                Spacer(modifier = Modifier.height(12.dp))

                if (!note.aiTags.isNullOrEmpty()) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        note.aiTags.split(",").filter { it.isNotBlank() }.forEach { tag ->
                            Surface(
                                color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.4f),
                                shape = RoundedCornerShape(4.dp)
                            ) {
                                Text(
                                    text = tag.trim(),
                                    style = MaterialTheme.typography.labelSmall,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                    color = MaterialTheme.colorScheme.onSecondaryContainer
                                )
                            }
                        }
                    }
                } else {
                    Text(
                        text = "无标签",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                    )
                }

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
