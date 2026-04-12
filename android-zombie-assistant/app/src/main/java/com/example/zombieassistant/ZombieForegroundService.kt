package com.example.zombieassistant

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.IBinder
import android.util.Log
import android.os.Build

class ZombieForegroundService : Service() {

    private lateinit var notificationManager: NotificationManager
    private var isRunning = false
    private val performanceOptimizer = PerformanceOptimizer.getInstance()
    private lateinit var taskManager: TaskManager
    private var accessibilityService: ZombieAccessibilityService? = null
    private val binder = LocalBinder()

    override fun onCreate() {
        super.onCreate()
        notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        createNotificationChannel()
        
        // 开始性能监控
        performanceOptimizer.startPerformanceMonitoring()
        
        Log.d("ZombieForegroundService", "服务创建成功")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(1, createNotification())
        isRunning = true
        
        // 启动自动化任务
        startAutomationTask()
        
        Log.d("ZombieForegroundService", "服务启动成功")
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? {
        return binder
    }

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        taskManager?.stopTasks()
        performanceOptimizer.release()
        Log.d("ZombieForegroundService", "服务已停止")
    }

    /**
     * 绑定无障碍服务
     */
    fun setAccessibilityService(service: ZombieAccessibilityService) {
        accessibilityService = service
        // 初始化任务管理器
        taskManager = TaskManager(this, service)
        
        // 初始化任务设置
        val taskSettings = TaskManager.TaskSettings(
            daily = true,
            main = true,
            rescue = true,
            expedition = true,
            countLimit = 100,
            teamTimeout = 300
        )
        taskManager.initTasks(taskSettings)
        
        Log.d("ZombieForegroundService", "无障碍服务绑定成功")
    }

    /**
     * 更新通知
     */
    fun updateNotification(content: String) {
        val notification = createNotification(content)
        notificationManager.notify(1, notification)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                "zombie_assistant_channel",
                "僵尸助手",
                NotificationManager.IMPORTANCE_DEFAULT
            )
            channel.description = "僵尸助手脚本服务"
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(content: String = "脚本运行中..."): Notification {
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, "zombie_assistant_channel")
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        
        return builder
            .setContentTitle("僵尸助手")
            .setContentText(content)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setPriority(Notification.PRIORITY_DEFAULT)
            .build()
    }

    private fun startAutomationTask() {
        // 使用性能优化器执行后台任务
        performanceOptimizer.executeBackgroundTask {
            try {
                Log.d("ZombieForegroundService", "开始执行自动化任务")
                
                if (::taskManager.isInitialized) {
                    taskManager.startTasks()
                } else {
                    Log.e("ZombieForegroundService", "任务管理器未初始化")
                }
                
                while (isRunning) {
                    try {
                        Thread.sleep(1000)
                    } catch (e: InterruptedException) {
                        val errorHandler = ErrorHandler.getInstance(this@ZombieForegroundService)
                        errorHandler.handleException(e, "ForegroundService")
                    }
                }
                
                Log.d("ZombieForegroundService", "自动化任务已停止")
            } catch (e: Exception) {
                val errorHandler = ErrorHandler.getInstance(this@ZombieForegroundService)
                errorHandler.handleException(e, "ForegroundService")
            }
        }
    }

    /**
     * 本地Binder类
     */
    inner class LocalBinder : Binder() {
        fun getService(): ZombieForegroundService = this@ZombieForegroundService
    }
}