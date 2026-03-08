package com.snowtraces.noteall.ui.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.snowtraces.noteall.network.NoteItem
import androidx.compose.foundation.BorderStroke

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
