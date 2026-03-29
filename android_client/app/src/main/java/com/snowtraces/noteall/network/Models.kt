package com.snowtraces.noteall.network

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class LoginRequest(
    val password: String
)

@JsonClass(generateAdapter = true)
data class LoginResponse(
    val token: String,
    val message: String?
)

@JsonClass(generateAdapter = true)
data class NoteItem(
    val id: Int,
    @Json(name = "created_at") val createdAt: String?,
    @Json(name = "original_name") val originalName: String?,
    @Json(name = "storage_id") val storageId: String,
    @Json(name = "file_type") val fileType: String?,
    @Json(name = "file_size") val fileSize: Long?,
    @Json(name = "ocr_text") val ocrText: String?,
    @Json(name = "ai_summary") val aiSummary: String?,
    @Json(name = "ai_tags") val aiTags: String?,
    @Json(name = "original_url") val originalUrl: String?,
    val status: String?
)

@JsonClass(generateAdapter = true)
data class TextUploadRequest(
    val text: String
)

@JsonClass(generateAdapter = true)
data class StatusUpdateRequest(
    val status: String
)

@JsonClass(generateAdapter = true)
data class TextUploadResponse(
    @Json(name = "storage_id") val storageId: String,
    @Json(name = "message") val message: String?
)

@JsonClass(generateAdapter = true)
data class NoteItemsResponse(
    val code: Int?,
    val data: List<NoteItem>?
)

@JsonClass(generateAdapter = true)
data class TagItem(
    val Tag: String,
    val Count: Int
)

@JsonClass(generateAdapter = true)
data class TagsResponse(
    val code: Int?,
    val data: List<TagItem>?
)

@JsonClass(generateAdapter = true)
data class AskRequest(
    val messages: List<Map<String, String>>,
    @Json(name = "session_id") val sessionId: Int? = 0
)

@JsonClass(generateAdapter = true)
data class AskResponse(
    val data: String?,
    @Json(name = "session_id") val sessionId: Int?,
    val references: List<NoteItem>?
)

@JsonClass(generateAdapter = true)
data class ChatSession(
    val id: Int,
    val title: String,
    @Json(name = "created_at") val createdAt: String?
)

@JsonClass(generateAdapter = true)
data class ChatSessionsResponse(
    val code: Int? = 0,
    val data: List<ChatSession>? = emptyList()
)

@JsonClass(generateAdapter = true)
data class ChatMessage(
    val id: Int,
    @Json(name = "session_id") val sessionId: Int,
    val role: String, // "user" or "assistant"
    val content: String,
    val references: List<NoteItem>?,
    @Json(name = "created_at") val createdAt: String?
)

@JsonClass(generateAdapter = true)
data class ChatMessagesResponse(
    val code: Int? = 0,
    val data: List<ChatMessage>? = emptyList()
)
@JsonClass(generateAdapter = true)
data class CreateShareRequest(
    @Json(name = "note_id") val noteId: Int,
    @Json(name = "expire_days") val expireDays: Int = 0
)

@JsonClass(generateAdapter = true)
data class ShareItem(
    val id: String,
    @Json(name = "note_id") val noteId: Int,
    @Json(name = "created_at") val createdAt: String,
    @Json(name = "expires_at") val expiresAt: String?
)

@JsonClass(generateAdapter = true)
data class ShareResponse(
    val code: Int?,
    val data: ShareItem?
)

@JsonClass(generateAdapter = true)
data class ShareListResponse(
    val code: Int?,
    val data: List<ShareItem>?
)
