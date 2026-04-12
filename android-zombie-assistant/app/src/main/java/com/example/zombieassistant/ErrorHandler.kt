package com.example.zombieassistant

import android.content.Context
import android.util.Log
import java.io.File
import java.io.FileWriter
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.*

class ErrorHandler private constructor(private val context: Context) {

    private val logFile: File
    private val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())

    init {
        // 创建日志文件
        val logDir = File(context.filesDir, "logs")
        if (!logDir.exists()) {
            logDir.mkdirs()
        }
        logFile = File(logDir, "error_log.txt")
        if (!logFile.exists()) {
            logFile.createNewFile()
        }
        Log.d("ErrorHandler", "错误处理器初始化成功")
    }

    /**
     * 处理异常
     */
    fun handleException(e: Exception, context: String) {
        val errorMessage = buildErrorMessage(e, context)
        Log.e("ErrorHandler", errorMessage)
        writeToLogFile(errorMessage)
        
        // 尝试恢复操作
        attemptRecovery(context)
    }

    /**
     * 构建错误消息
     */
    private fun buildErrorMessage(e: Exception, context: String): String {
        val timestamp = dateFormat.format(Date())
        val errorType = e.javaClass.simpleName
        val errorMessage = e.message ?: "无错误信息"
        val stackTrace = e.stackTrace.joinToString("\n") { it.toString() }
        
        return "[$timestamp] 错误类型: $errorType\n" +
               "上下文: $context\n" +
               "错误信息: $errorMessage\n" +
               "堆栈跟踪:\n$stackTrace\n"
    }

    /**
     * 写入日志文件
     */
    private fun writeToLogFile(message: String) {
        try {
            val writer = FileWriter(logFile, true)
            writer.write(message)
            writer.write("\n" + "=".repeat(80) + "\n")
            writer.close()
            Log.d("ErrorHandler", "错误日志已写入文件")
        } catch (ioe: IOException) {
            Log.e("ErrorHandler", "写入日志文件失败: ${ioe.message}")
        }
    }

    /**
     * 尝试恢复操作
     */
    private fun attemptRecovery(context: String) {
        Log.d("ErrorHandler", "尝试从错误中恢复: $context")
        
        // 根据不同的上下文执行不同的恢复策略
        when (context) {
            "ImageRecognition" -> {
                // 图像识别错误恢复
                Log.d("ErrorHandler", "执行图像识别错误恢复")
                // 可以尝试重新初始化OCR或清理缓存
            }
            "TaskManager" -> {
                // 任务管理错误恢复
                Log.d("ErrorHandler", "执行任务管理错误恢复")
                // 可以尝试重置任务状态或重新初始化任务
            }
            "AccessibilityService" -> {
                // 无障碍服务错误恢复
                Log.d("ErrorHandler", "执行无障碍服务错误恢复")
                // 可以尝试重新绑定服务或重启服务
            }
            "ForegroundService" -> {
                // 前台服务错误恢复
                Log.d("ErrorHandler", "执行前台服务错误恢复")
                // 可以尝试重启服务或重新初始化组件
            }
            else -> {
                // 通用错误恢复
                Log.d("ErrorHandler", "执行通用错误恢复")
            }
        }
    }

    /**
     * 获取错误日志
     */
    fun getErrorLogs(): String {
        try {
            return logFile.readText()
        } catch (e: IOException) {
            Log.e("ErrorHandler", "读取错误日志失败: ${e.message}")
            return "读取错误日志失败: ${e.message}"
        }
    }

    /**
     * 清理错误日志
     */
    fun clearErrorLogs() {
        try {
            logFile.writeText("")
            Log.d("ErrorHandler", "错误日志已清理")
        } catch (e: IOException) {
            Log.e("ErrorHandler", "清理错误日志失败: ${e.message}")
        }
    }

    companion object {
        private var instance: ErrorHandler? = null

        fun getInstance(context: Context): ErrorHandler {
            if (instance == null) {
                instance = ErrorHandler(context.applicationContext)
            }
            return instance!!
        }
    }
}