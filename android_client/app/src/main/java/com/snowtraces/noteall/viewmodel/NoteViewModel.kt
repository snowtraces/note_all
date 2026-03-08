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
        currentView = view
        refresh()
    }

    fun refresh() {
        if (baseUrl.isEmpty()) return
        
        viewModelScope.launch {
            if (isRefreshing) return@launch
            
            if (notes.isEmpty()) {
                isLoading = true
            } else {
                isRefreshing = true
            }

            try {
                notes = if (currentView == AppView.Home) {
                    repository.getNotes(baseUrl, searchQuery)
                } else {
                    repository.getTrash(baseUrl)
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
}
