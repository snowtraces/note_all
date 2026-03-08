package com.snowtraces.noteall.viewmodel

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.snowtraces.noteall.data.NoteRepository
import com.snowtraces.noteall.network.ChatMessage
import com.snowtraces.noteall.network.ChatSession
import com.snowtraces.noteall.network.NoteItem
import kotlinx.coroutines.launch

class ChatViewModel(private val repository: NoteRepository) : ViewModel() {

    var baseUrl: String = ""
    
    // Sessions List
    var sessions = mutableStateListOf<ChatSession>()
    var isLoadingSessions by mutableStateOf(false)

    // Current Chat
    var currentSessionId by mutableStateOf<Int?>(null)
    var messages = mutableStateListOf<ChatMessage>()
    var isSending by mutableStateOf(false)
    var currentError by mutableStateOf<String?>(null)

    fun refreshSessions() {
        if (baseUrl.isEmpty()) return
        viewModelScope.launch {
            isLoadingSessions = true
            currentError = null
            try {
                val list = repository.getChatSessions(baseUrl)
                sessions.clear()
                sessions.addAll(list)
            } catch (e: Exception) {
                currentError = "加载会话列表失败: ${e.message}"
            } finally {
                isLoadingSessions = false
            }
        }
    }

    fun startNewChat() {
        currentSessionId = null
        messages.clear()
        currentError = null
    }

    fun loadSession(sessionId: Int) {
        currentSessionId = sessionId
        messages.clear()
        viewModelScope.launch {
            isSending = true
            try {
                val list = repository.getChatMessages(baseUrl, sessionId)
                messages.addAll(list)
            } catch (e: Exception) {
                currentError = "加载消息失败: ${e.message}"
            } finally {
                isSending = false
            }
        }
    }

    fun sendMessage(content: String) {
        if (content.isBlank() || isSending) return
        
        // Optimistic update for UI (temporary message before server response)
        // Since the backend will return the full session/history, we'll wait for the real response
        // but adding local one for immediate feedback is better.
        val userMsg = ChatMessage(
            id = -1, 
            sessionId = currentSessionId ?: 0, 
            role = "user", 
            content = content, 
            references = null, 
            createdAt = null
        )
        messages.add(userMsg)
        
        val chatHistory = messages.filter { it.id != -1 }.map { 
            mapOf("role" to it.role, "content" to it.content)
        }.toMutableList()
        chatHistory.add(mapOf("role" to "user", "content" to content))

        isSending = true
        currentError = null
        
        viewModelScope.launch {
            try {
                val response = repository.ask(baseUrl, chatHistory, currentSessionId)
                if (currentSessionId == null) {
                    currentSessionId = response.sessionId
                }
                
                // Remove the optimistic message
                messages.remove(userMsg)
                
                // Instead of clearing, we can just fetch the latest message or the whole history.
                // The backend Ask returns the latest assistant message and the session_id.
                // It's cleaner to just append the user and assistant message properly.
                
                val realUserMsg = ChatMessage(
                    id = 0, // Placeholder
                    sessionId = currentSessionId!!,
                    role = "user",
                    content = content,
                    references = null,
                    createdAt = null
                )
                val assistantMsg = ChatMessage(
                    id = 0, // Placeholder
                    sessionId = currentSessionId!!,
                    role = "assistant",
                    content = response.data ?: "",
                    references = response.references,
                    createdAt = null
                )
                messages.add(realUserMsg)
                messages.add(assistantMsg)
            } catch (e: Exception) {
                currentError = "发送失败: ${e.message}"
                messages.remove(userMsg) // Remove on failure
            } finally {
                isSending = false
            }
        }
    }

    fun deleteSession(sessionId: Int) {
        viewModelScope.launch {
            try {
                repository.deleteChatSession(baseUrl, sessionId)
                refreshSessions()
                if (currentSessionId == sessionId) {
                    startNewChat()
                }
            } catch (e: Exception) {
                currentError = "删除失败: ${e.message}"
            }
        }
    }
}
