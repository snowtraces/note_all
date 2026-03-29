package com.snowtraces.noteall.data

import com.snowtraces.noteall.network.ApiClient
import com.snowtraces.noteall.network.AskRequest
import com.snowtraces.noteall.network.AskResponse
import com.snowtraces.noteall.network.ChatMessage
import com.snowtraces.noteall.network.ChatSession
import com.snowtraces.noteall.network.LoginRequest
import com.snowtraces.noteall.network.LoginResponse
import com.snowtraces.noteall.network.NoteItem
import com.snowtraces.noteall.network.TextUploadRequest
import com.snowtraces.noteall.network.StatusUpdateRequest
import okhttp3.MultipartBody

class NoteRepository {
    suspend fun login(baseUrl: String, password: String): LoginResponse {
        val api = ApiClient.getApi(baseUrl)
        return api.login(LoginRequest(password))
    }

    suspend fun getNotes(baseUrl: String, query: String): List<NoteItem> {
        if (baseUrl.isEmpty()) return emptyList()
        val api = ApiClient.getApi(baseUrl)
        val response = api.searchNotes(query)
        return response.data ?: emptyList()
    }

    suspend fun getTrash(baseUrl: String): List<NoteItem> {
        if (baseUrl.isEmpty()) return emptyList()
        val api = ApiClient.getApi(baseUrl)
        val response = api.getTrash()
        return response.data ?: emptyList()
    }

    suspend fun deleteNote(baseUrl: String, noteId: Int) {
        val api = ApiClient.getApi(baseUrl)
        api.deleteNote(noteId)
    }

    suspend fun restoreNote(baseUrl: String, noteId: Int) {
        val api = ApiClient.getApi(baseUrl)
        api.restoreNote(noteId)
    }

    suspend fun hardDeleteNote(baseUrl: String, noteId: Int) {
        val api = ApiClient.getApi(baseUrl)
        api.hardDeleteNote(noteId)
    }

    suspend fun updateNoteText(baseUrl: String, noteId: Int, text: String) {
        val api = ApiClient.getApi(baseUrl)
        api.updateNoteText(noteId, TextUploadRequest(text))
    }

    suspend fun updateNoteStatus(baseUrl: String, noteId: Int, status: String) {
        val api = ApiClient.getApi(baseUrl)
        api.updateNoteStatus(noteId, StatusUpdateRequest(status))
    }

    suspend fun uploadText(baseUrl: String, text: String) {
        val api = ApiClient.getApi(baseUrl)
        api.uploadText(TextUploadRequest(text))
    }

    suspend fun uploadImage(baseUrl: String, body: MultipartBody.Part) {
        val api = ApiClient.getApi(baseUrl)
        api.uploadImage(body)
    }

    suspend fun ask(baseUrl: String, messages: List<Map<String, String>>, sessionId: Int?): AskResponse {
        val api = ApiClient.getApi(baseUrl)
        return api.ask(AskRequest(messages, sessionId))
    }

    suspend fun getChatSessions(baseUrl: String): List<ChatSession> {
        if (baseUrl.isEmpty()) return emptyList()
        val api = ApiClient.getApi(baseUrl)
        return api.listChatSessions().data ?: emptyList()
    }

    suspend fun getChatMessages(baseUrl: String, sessionId: Int): List<ChatMessage> {
        val api = ApiClient.getApi(baseUrl)
        return api.getChatMessages(sessionId).data ?: emptyList()
    }

    suspend fun deleteChatSession(baseUrl: String, sessionId: Int) {
        val api = ApiClient.getApi(baseUrl)
        api.deleteChatSession(sessionId)
    }
}
