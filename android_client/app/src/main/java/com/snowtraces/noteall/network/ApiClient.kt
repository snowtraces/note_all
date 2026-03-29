package com.snowtraces.noteall.network

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit

object ApiClient {
    private var retrofit: Retrofit? = null

    /**
     * 系统访问密码，对应后端的 sys_password。
     * 由 UI (MainActivity) 从 DataStore 读取后注入。
     */
    var authToken: String = ""

    private val moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()

    // 针对 AI 接口的长耗时特性，配置专用的 OkHttpClient
    // 设置为 public 以便 Coil 等图片加载库复用同一套请求配置（含认证 Header）
    val client = OkHttpClient.Builder()
        .connectTimeout(60, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS) // 与后端 RAGChat 120s 超时保持一致
        .writeTimeout(60, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            val original = chain.request()
            // 如果提供了 authToken，则注入 Authorization Header
            val requestBuilder = original.newBuilder()
            if (authToken.isNotEmpty()) {
                requestBuilder.header("Authorization", "Bearer $authToken")
            }
            chain.proceed(requestBuilder.build())
        }
        .build()

    fun getApi(baseUrl: String): NoteApi {
        val url = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        
        if (retrofit == null || retrofit?.baseUrl()?.toString() != url) {
            retrofit = Retrofit.Builder()
                .baseUrl(url)
                .client(client) // 使用带超时控制的 client
                .addConverterFactory(MoshiConverterFactory.create(moshi))
                .build()
        }
        return retrofit!!.create(NoteApi::class.java)
    }
}
