package com.snowtraces.noteall.ui.components

import android.widget.TextView
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import io.noties.markwon.Markwon
import io.noties.markwon.ext.strikethrough.StrikethroughPlugin
import io.noties.markwon.ext.tables.TablePlugin
import io.noties.markwon.ext.tasklist.TaskListPlugin
import io.noties.markwon.html.HtmlPlugin
import io.noties.markwon.inlineparser.MarkwonInlineParserPlugin

@Composable
fun MarkdownDisplay(content: String, isPrimary: Boolean = true, fontSize: Float? = null) {
    val context = LocalContext.current
    val textSize = fontSize ?: if (isPrimary) 16f else 14f

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
                this.setTextIsSelectable(true)
            }
        },
        update = { textView ->
            markwon.setMarkdown(textView, content)
        },
        modifier = Modifier.fillMaxWidth()
    )
}
