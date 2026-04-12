package com.example.zombieassistant

import android.content.Context
import android.content.SharedPreferences
import android.util.Log

class ConfigManager private constructor(private val context: Context) {

    private val sharedPreferences: SharedPreferences
    
    init {
        sharedPreferences = context.getSharedPreferences("zombie_assistant_config", Context.MODE_PRIVATE)
    }

    // 任务配置
    fun getTaskConfig(): TaskConfig {
        return TaskConfig(
            daily = getBoolean("task_daily", true),
            main = getBoolean("task_main", true),
            rescue = getBoolean("task_rescue", true),
            expedition = getBoolean("task_expedition", true),
            countLimit = getInt("task_count_limit", 100),
            teamTimeout = getInt("task_team_timeout", 300)
        )
    }

    fun setTaskConfig(config: TaskConfig) {
        putBoolean("task_daily", config.daily)
        putBoolean("task_main", config.main)
        putBoolean("task_rescue", config.rescue)
        putBoolean("task_expedition", config.expedition)
        putInt("task_count_limit", config.countLimit)
        putInt("task_team_timeout", config.teamTimeout)
        Log.d("ConfigManager", "任务配置已更新")
    }

    // 识别配置
    fun getRecognitionConfig(): RecognitionConfig {
        return RecognitionConfig(
            templateThreshold = getFloat("recognition_template_threshold", 0.8f),
            ocrEnabled = getBoolean("recognition_ocr_enabled", true),
            sceneCacheTime = getInt("recognition_scene_cache_time", 2000)
        )
    }

    fun setRecognitionConfig(config: RecognitionConfig) {
        putFloat("recognition_template_threshold", config.templateThreshold)
        putBoolean("recognition_ocr_enabled", config.ocrEnabled)
        putInt("recognition_scene_cache_time", config.sceneCacheTime)
        Log.d("ConfigManager", "识别配置已更新")
    }

    // 操作配置
    fun getOperationConfig(): OperationConfig {
        return OperationConfig(
            clickDelay = getInt("operation_click_delay", 500),
            swipeDuration = getInt("operation_swipe_duration", 500),
            retryCount = getInt("operation_retry_count", 3)
        )
    }

    fun setOperationConfig(config: OperationConfig) {
        putInt("operation_click_delay", config.clickDelay)
        putInt("operation_swipe_duration", config.swipeDuration)
        putInt("operation_retry_count", config.retryCount)
        Log.d("ConfigManager", "操作配置已更新")
    }

    // 性能配置
    fun getPerformanceConfig(): PerformanceConfig {
        return PerformanceConfig(
            maxThreads = getInt("performance_max_threads", 4),
            imageCacheEnabled = getBoolean("performance_image_cache_enabled", true),
            memoryLimitMB = getInt("performance_memory_limit_mb", 200)
        )
    }

    fun setPerformanceConfig(config: PerformanceConfig) {
        putInt("performance_max_threads", config.maxThreads)
        putBoolean("performance_image_cache_enabled", config.imageCacheEnabled)
        putInt("performance_memory_limit_mb", config.memoryLimitMB)
        Log.d("ConfigManager", "性能配置已更新")
    }

    // 通用方法
    private fun getBoolean(key: String, defaultValue: Boolean): Boolean {
        return sharedPreferences.getBoolean(key, defaultValue)
    }

    private fun putBoolean(key: String, value: Boolean) {
        sharedPreferences.edit().putBoolean(key, value).apply()
    }

    private fun getInt(key: String, defaultValue: Int): Int {
        return sharedPreferences.getInt(key, defaultValue)
    }

    private fun putInt(key: String, value: Int) {
        sharedPreferences.edit().putInt(key, value).apply()
    }

    private fun getFloat(key: String, defaultValue: Float): Float {
        return sharedPreferences.getFloat(key, defaultValue)
    }

    private fun putFloat(key: String, value: Float) {
        sharedPreferences.edit().putFloat(key, value).apply()
    }

    private fun getString(key: String, defaultValue: String): String {
        return sharedPreferences.getString(key, defaultValue) ?: defaultValue
    }

    private fun putString(key: String, value: String) {
        sharedPreferences.edit().putString(key, value).apply()
    }

    // 重置所有配置
    fun resetAllConfig() {
        sharedPreferences.edit().clear().apply()
        Log.d("ConfigManager", "所有配置已重置")
    }

    // 配置数据类
    data class TaskConfig(
        val daily: Boolean,
        val main: Boolean,
        val rescue: Boolean,
        val expedition: Boolean,
        val countLimit: Int,
        val teamTimeout: Int
    )

    data class RecognitionConfig(
        val templateThreshold: Float,
        val ocrEnabled: Boolean,
        val sceneCacheTime: Int
    )

    data class OperationConfig(
        val clickDelay: Int,
        val swipeDuration: Int,
        val retryCount: Int
    )

    data class PerformanceConfig(
        val maxThreads: Int,
        val imageCacheEnabled: Boolean,
        val memoryLimitMB: Int
    )

    companion object {
        private var instance: ConfigManager? = null

        fun getInstance(context: Context): ConfigManager {
            if (instance == null) {
                instance = ConfigManager(context.applicationContext)
            }
            return instance!!
        }
    }
}