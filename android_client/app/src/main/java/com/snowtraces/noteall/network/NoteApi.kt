package com.snowtraces.noteall.network

import okhttp3.MultipartBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

interface NoteApi {

    @GET("/api/search")
    suspend fun searchNotes(@Query("q") query: String): NoteItemsResponse

    @Multipart
    @POST("/api/upload")
    suspend fun uploadImage(@Part file: MultipartBody.Part): Any // Assuming we don't strictly need to parse the response yet

    @POST("/api/note/text")
    suspend fun uploadText(@Body request: TextUploadRequest): TextUploadResponse

    @GET("/api/tags")
    suspend fun getTags(): TagsResponse

    @PATCH("/api/note/{id}/text")
    suspend fun updateNoteText(@Path("id") noteId: Int, @Body request: TextUploadRequest): Any

    @PATCH("/api/note/{id}/status")
    suspend fun updateNoteStatus(@Path("id") noteId: Int, @Body request: StatusUpdateRequest): Any

    @retrofit2.http.DELETE("/api/note/{id}")
    suspend fun deleteNote(@Path("id") noteId: Int): Any

    @GET("/api/trash")
    suspend fun getTrash(): NoteItemsResponse

    @POST("/api/note/{id}/restore")
    suspend fun restoreNote(@Path("id") noteId: Int): Any

    @retrofit2.http.DELETE("/api/note/{id}/hard")
    suspend fun hardDeleteNote(@Path("id") noteId: Int): Any

    @POST("/api/ask")
    suspend fun ask(@Body request: AskRequest): AskResponse

    @GET("/api/chat/sessions")
    suspend fun listChatSessions(): ChatSessionsResponse

    @GET("/api/chat/session/{id}")
    suspend fun getChatMessages(@Path("id") sessionId: Int): ChatMessagesResponse

    @retrofit2.http.DELETE("/api/chat/session/{id}")
    suspend fun deleteChatSession(@Path("id") sessionId: Int): Any
}
