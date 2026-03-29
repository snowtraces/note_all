package com.snowtraces.noteall

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import com.snowtraces.noteall.network.ApiClient

/**
 * 自定义 Application 类，用于全局配置图片加载引擎。
 * 确保 AsyncImage 在加载图片时也能携带正确的 Authorization Header。
 */
class NoteAllApplication : Application(), ImageLoaderFactory {
    override fun newImageLoader(): ImageLoader {
        return ImageLoader.Builder(this)
            // 复用 ApiClient 中配置好的 OkHttpClient
            .okHttpClient { ApiClient.client }
            .crossfade(true)
            .build()
    }
}
