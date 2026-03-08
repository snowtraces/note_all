package com.snowtraces.noteall.data

import com.snowtraces.noteall.network.ApiClient
import com.snowtraces.noteall.network.NoteItem
import com.snowtraces.noteall.network.TextUploadRequest
import okhttp3.MultipartBody

class NoteRepository {

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

    suspend fun uploadText(baseUrl: String, text: String) {
        val api = ApiClient.getApi(baseUrl)
        api.uploadText(TextUploadRequest(text))
    }

    suspend fun uploadImage(baseUrl: String, body: MultipartBody.Part) {
        val api = ApiClient.getApi(baseUrl)
        api.uploadImage(body)
    }
}
