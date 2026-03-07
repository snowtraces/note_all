package com.snowtraces.noteall.network

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

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
    val status: String?
)

@JsonClass(generateAdapter = true)
data class TextUploadRequest(
    val text: String
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
