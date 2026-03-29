package com.snowtraces.noteall.config

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

class ConfigManager(private val context: Context) {

    companion object {
        val BASE_URL_KEY = stringPreferencesKey("base_url")
        val AUTH_TOKEN_KEY = stringPreferencesKey("auth_token")
        val RAW_PASSWORD_KEY = stringPreferencesKey("raw_password")
    }

    val baseUrlFlow: Flow<String> = context.dataStore.data.map { preferences ->
        preferences[BASE_URL_KEY] ?: "http://192.168.31.200:8080"
    }

    val authTokenFlow: Flow<String> = context.dataStore.data.map { preferences ->
        preferences[AUTH_TOKEN_KEY] ?: ""
    }

    val rawPasswordFlow: Flow<String> = context.dataStore.data.map { preferences ->
        preferences[RAW_PASSWORD_KEY] ?: ""
    }

    suspend fun saveBaseUrl(url: String) {
        context.dataStore.edit { preferences ->
            preferences[BASE_URL_KEY] = url
        }
    }

    suspend fun saveAuthToken(token: String) {
        context.dataStore.edit { preferences ->
            preferences[AUTH_TOKEN_KEY] = token
        }
    }

    suspend fun saveRawPassword(password: String) {
        context.dataStore.edit { preferences ->
            preferences[RAW_PASSWORD_KEY] = password
        }
    }
}
