package com.snowtraces.noteall.viewmodel

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.snowtraces.noteall.data.NoteRepository
import com.snowtraces.noteall.model.AppView
import com.snowtraces.noteall.network.NoteItem
import kotlinx.coroutines.launch

class NoteViewModel(private val repository: NoteRepository) : ViewModel() {

    var notes by mutableStateOf<List<NoteItem>>(emptyList())
        private set

    var isLoading by mutableStateOf(false)
        private set

    var isRefreshing by mutableStateOf(false)
        private set

    var searchQuery by mutableStateOf("")
        private set

    var currentView by mutableStateOf(AppView.Home)
        private set

    var baseUrl by mutableStateOf("")

    fun setView(view: AppView) {
        if (currentView != view) {
            val isSwitchingSource = (currentView == AppView.Home && view == AppView.Trash) || 
                                     (currentView == AppView.Trash && view == AppView.Home)
            currentView = view
            
            if (isSwitchingSource) {
                notes = emptyList() // Clear for list change
                refresh(showIndicator = true) 
            } else if (view == AppView.Home || view == AppView.Trash) {
                // Return from other screens (Chat/Sessions)
                refresh(showIndicator = false) // Silent sync in background
            }
        }
    }

    fun refresh(showIndicator: Boolean = false) {
        if (baseUrl.isEmpty()) return
        
        viewModelScope.launch {
            if (isRefreshing) return@launch
            
            if (notes.isEmpty()) {
                isLoading = true
            } else if (showIndicator) {
                isRefreshing = true
            }

            try {
                notes = when (currentView) {
                    AppView.Home -> repository.getNotes(baseUrl, searchQuery)
                    AppView.Trash -> repository.getTrash(baseUrl)
                    else -> notes // Don't refresh notes when in Chat/Sessions view
                }
            } catch (e: Exception) {
                // In a real app, we'd handle errors via a UI event/state
                notes = emptyList()
            } finally {
                isLoading = false
                isRefreshing = false
            }
        }
    }

    /**
     * 探测器同步：静默获取数据并比对指纹，若有变化则更新 UI。
     * 参考 Web 端实现，比对 id, status, summary, tags 和 ocr 长度。
     */
    fun syncNotes() {
        if (baseUrl.isEmpty() || isRefreshing || currentView != AppView.Home) return
        
        viewModelScope.launch {
            try {
                val fresh = repository.getNotes(baseUrl, searchQuery)
                val currentFp = getFingerprint(notes)
                val freshFp = getFingerprint(fresh)
                
                if (currentFp != freshFp) {
                    notes = fresh
                }
            } catch (e: Exception) {
                // 静默失败
            }
        }
    }

    private fun getFingerprint(list: List<NoteItem>): String {
        return list.joinToString(";") { r ->
            "${r.id}|${r.status}|${r.aiSummary}|${r.aiTags}|${r.ocrText?.length ?: 0}"
        }
    }

    fun search(query: String) {
        searchQuery = query
        refresh()
    }

    fun deleteNote(note: NoteItem, onComplete: () -> Unit, onError: (String) -> Unit) {
        viewModelScope.launch {
            try {
                if (currentView == AppView.Home) {
                    repository.deleteNote(baseUrl, note.id)
                } else {
                    repository.hardDeleteNote(baseUrl, note.id)
                }
                refresh()
                onComplete()
            } catch (e: Exception) {
                onError(e.message ?: "Unknown error")
            }
        }
    }

    fun restoreNote(noteId: Int, onComplete: () -> Unit, onError: (String) -> Unit) {
        viewModelScope.launch {
            try {
                repository.restoreNote(baseUrl, noteId)
                refresh()
                onComplete()
            } catch (e: Exception) {
                onError(e.message ?: "Unknown error")
            }
        }
    }

    fun updateNoteText(noteId: Int, newText: String, onComplete: () -> Unit, onError: (String) -> Unit) {
        viewModelScope.launch {
            try {
                repository.updateNoteText(baseUrl, noteId, newText)
                refresh()
                onComplete()
            } catch (e: Exception) {
                onError(e.message ?: "Unknown error")
            }
        }
    }

    suspend fun getNoteShares(noteId: Int): List<com.snowtraces.noteall.network.ShareItem> {
        return try {
            repository.getNoteShares(baseUrl, noteId)
        } catch (e: Exception) {
            emptyList()
        }
    }

    suspend fun createShare(noteId: Int): com.snowtraces.noteall.network.ShareItem? {
        return try {
            repository.createShare(baseUrl, noteId)
        } catch (e: Exception) {
            null
        }
    }

    suspend fun revokeShare(shareId: String) {
        try {
            repository.revokeShare(baseUrl, shareId)
        } catch (e: Exception) {
            // Error handling could be improved
        }
    }
}
