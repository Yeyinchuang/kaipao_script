package com.example.zombieassistant

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.graphics.Rect
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.WindowManager
import android.graphics.Point
import android.view.Display
import android.view.WindowManager
import android.view.InputEvent
import android.view.MotionEvent
import android.os.SystemClock
import android.view.ViewConfiguration

class ZombieAccessibilityService : AccessibilityService() {

    private lateinit var windowManager: WindowManager
    private lateinit var imageRecognition: ImageRecognition
    private var isRunning = false
    private var screenWidth: Int = 0
    private var screenHeight: Int = 0
    private val clickDelay = ViewConfiguration.getTapTimeout().toLong()

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        imageRecognition = ImageRecognition(this)
        
        // 获取屏幕尺寸
        val display: Display = windowManager.defaultDisplay
        val size = Point()
        display.getSize(size)
        screenWidth = size.x
        screenHeight = size.y
        
        Log.d("ZombieAccessibilityService", "服务创建成功，屏幕尺寸: ${screenWidth}x${screenHeight}")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        // 处理无障碍事件
        if (isRunning) {
            // 可以在这里处理特定的无障碍事件
        }
    }

    override fun onInterrupt() {
        // 服务被中断
        Log.d("ZombieAccessibilityService", "服务被中断")
    }

    /**
     * 模拟点击
     */
    fun performClick(x: Int, y: Int): Boolean {
        Log.d("ZombieAccessibilityService", "执行点击操作: ($x, $y)")
        
        try {
            // 确保坐标在屏幕范围内
            val safeX = Math.max(0, Math.min(x, screenWidth - 1))
            val safeY = Math.max(0, Math.min(y, screenHeight - 1))
            
            // 尝试通过无障碍节点点击
            val nodeInfo = findNodeByCoordinates(safeX, safeY)
            if (nodeInfo != null) {
                val success = nodeInfo.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                Log.d("ZombieAccessibilityService", "节点点击结果: $success")
                nodeInfo.recycle()
                if (success) {
                    return true
                }
            }
            
            // 如果找不到节点或点击失败，尝试使用注入事件的方式
            val downTime = SystemClock.uptimeMillis()
            val eventTime = SystemClock.uptimeMillis() + 100
            
            // 模拟按下事件
            val downEvent = MotionEvent.obtain(
                downTime,
                eventTime,
                MotionEvent.ACTION_DOWN,
                safeX.toFloat(),
                safeY.toFloat(),
                0
            )
            
            // 模拟抬起事件
            val upEvent = MotionEvent.obtain(
                downTime,
                eventTime + clickDelay,
                MotionEvent.ACTION_UP,
                safeX.toFloat(),
                safeY.toFloat(),
                0
            )
            
            // 注入事件
            val success = injectInputEvent(downEvent, InputEvent.INJECT_INPUT_EVENT_MODE_WAIT_FOR_FINISH)
            Thread.sleep(clickDelay)
            val success2 = injectInputEvent(upEvent, InputEvent.INJECT_INPUT_EVENT_MODE_WAIT_FOR_FINISH)
            
            downEvent.recycle()
            upEvent.recycle()
            
            val result = success && success2
            Log.d("ZombieAccessibilityService", "注入事件点击结果: $result")
            return result
        } catch (e: Exception) {
            val errorHandler = ErrorHandler.getInstance(this)
            errorHandler.handleException(e, "AccessibilityService")
            return false
        }
    }

    /**
     * 模拟滑动
     */
    fun performSwipe(startX: Int, startY: Int, endX: Int, endY: Int, duration: Long = 500): Boolean {
        Log.d("ZombieAccessibilityService", "执行滑动操作: ($startX, $startY) -> ($endX, $endY)")
        
        // 确保坐标在屏幕范围内
        val safeStartX = Math.max(0, Math.min(startX, screenWidth - 1))
        val safeStartY = Math.max(0, Math.min(startY, screenHeight - 1))
        val safeEndX = Math.max(0, Math.min(endX, screenWidth - 1))
        val safeEndY = Math.max(0, Math.min(endY, screenHeight - 1))
        
        try {
            val downTime = SystemClock.uptimeMillis()
            val eventTime = SystemClock.uptimeMillis() + 100
            
            // 模拟按下事件
            val downEvent = MotionEvent.obtain(
                downTime,
                eventTime,
                MotionEvent.ACTION_DOWN,
                safeStartX.toFloat(),
                safeStartY.toFloat(),
                0
            )
            
            // 模拟移动事件
            val moveEvent = MotionEvent.obtain(
                downTime,
                eventTime + duration / 2,
                MotionEvent.ACTION_MOVE,
                (safeStartX + (safeEndX - safeStartX) / 2).toFloat(),
                (safeStartY + (safeEndY - safeStartY) / 2).toFloat(),
                0
            )
            
            // 模拟抬起事件
            val upEvent = MotionEvent.obtain(
                downTime,
                eventTime + duration,
                MotionEvent.ACTION_UP,
                safeEndX.toFloat(),
                safeEndY.toFloat(),
                0
            )
            
            // 注入事件
            val success1 = injectInputEvent(downEvent, InputEvent.INJECT_INPUT_EVENT_MODE_WAIT_FOR_FINISH)
            Thread.sleep(duration / 2)
            val success2 = injectInputEvent(moveEvent, InputEvent.INJECT_INPUT_EVENT_MODE_WAIT_FOR_FINISH)
            Thread.sleep(duration / 2)
            val success3 = injectInputEvent(upEvent, InputEvent.INJECT_INPUT_EVENT_MODE_WAIT_FOR_FINISH)
            
            downEvent.recycle()
            moveEvent.recycle()
            upEvent.recycle()
            
            val result = success1 && success2 && success3
            Log.d("ZombieAccessibilityService", "滑动操作结果: $result")
            return result
        } catch (e: Exception) {
            Log.e("ZombieAccessibilityService", "滑动操作出错: ${e.message}")
            return false
        }
    }

    /**
     * 智能点击：支持模板识别点击或坐标点击
     */
    fun smartClick(templateName: String? = null, position: Pair<Int, Int>? = null, offset: Pair<Int, Int> = Pair(0, 0), region: Rect? = null, retry: Int = 1): Boolean {
        for (attempt in 0 until retry) {
            if (templateName != null) {
                // 通过模板识别点击
                val screenshot = takeScreenshot()
                if (screenshot != null) {
                    val result = imageRecognition.matchTemplate(screenshot, templateName, 0.8, region)
                    if (result.confidence > 0.8) {
                        val x = result.x + offset.first
                        val y = result.y + offset.second
                        val success = performClick(x, y)
                        if (success) {
                            Log.d("ZombieAccessibilityService", "模板点击成功: $templateName (置信度: ${result.confidence})")
                            return true
                        }
                    }
                }
            } else if (position != null) {
                // 通过坐标点击
                val x = position.first + offset.first
                val y = position.second + offset.second
                val success = performClick(x, y)
                if (success) {
                    Log.d("ZombieAccessibilityService", "坐标点击成功: ($x, $y)")
                    return true
                }
            }
            
            if (attempt < retry - 1) {
                Log.d("ZombieAccessibilityService", "点击失败，尝试重试 ${attempt + 1}/$retry")
                try {
                    Thread.sleep(1000)
                } catch (e: InterruptedException) {
                    e.printStackTrace()
                }
            }
        }
        Log.d("ZombieAccessibilityService", "点击失败: ${templateName ?: position.toString()}")
        return false
    }

    /**
     * 智能滚动屏幕
     */
    fun smartScroll(direction: String = "down", distance: Int = 300, duration: Long = 500): Boolean {
        val centerX = screenWidth / 2
        var success = false
        
        if (direction == "down") {
            val startY = screenHeight * 3 / 4
            val endY = startY - distance
            success = performSwipe(centerX, startY, centerX, endY, duration)
        } else { // up
            val startY = screenHeight / 4
            val endY = startY + distance
            success = performSwipe(centerX, startY, centerX, endY, duration)
        }
        Log.d("ZombieAccessibilityService", "滚动屏幕: $direction, 结果: $success")
        return success
    }

    /**
     * 拍摄屏幕截图
     */
    fun takeScreenshot(): Bitmap? {
        try {
            // 使用MediaProjection API或其他方式实现屏幕截图
            // 这里返回null，实际项目中需要实现具体的截图逻辑
            // 可以使用ADB命令或MediaProjection API
            Log.d("ZombieAccessibilityService", "拍摄屏幕截图")
            // 实际项目中，这里应该返回真实的屏幕截图
            return null
        } catch (e: Exception) {
            Log.e("ZombieAccessibilityService", "截图失败: ${e.message}")
            return null
        }
    }

    /**
     * 根据坐标查找节点
     */
    private fun findNodeByCoordinates(x: Int, y: Int): AccessibilityNodeInfo? {
        val rootNode = rootInActiveWindow ?: return null
        return findNodeByCoordinates(rootNode, x, y)
    }

    private fun findNodeByCoordinates(node: AccessibilityNodeInfo, x: Int, y: Int): AccessibilityNodeInfo? {
        val rect = Rect()
        node.getBoundsInScreen(rect)
        
        if (rect.contains(x, y)) {
            for (i in 0 until node.childCount) {
                val child = node.getChild(i)
                if (child != null) {
                    val result = findNodeByCoordinates(child, x, y)
                    if (result != null) {
                        return result
                    }
                    child.recycle()
                }
            }
            return node
        }
        return null
    }

    /**
     * 开始自动化任务
     */
    fun startAutomation() {
        isRunning = true
        Log.d("ZombieAccessibilityService", "开始自动化任务")
    }

    /**
     * 停止自动化任务
     */
    fun stopAutomation() {
        isRunning = false
        Log.d("ZombieAccessibilityService", "停止自动化任务")
    }

    /**
     * 获取屏幕宽度
     */
    fun getScreenWidth(): Int {
        return screenWidth
    }

    /**
     * 获取屏幕高度
     */
    fun getScreenHeight(): Int {
        return screenHeight
    }

    /**
     * 注入输入事件
     */
    private fun injectInputEvent(event: InputEvent, mode: Int): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                dispatchGesture(MotionEvent.obtain(event as MotionEvent), null, null)
            } else {
                // 对于低于Android N的设备，可以使用其他方式
                false
            }
        } catch (e: Exception) {
            Log.e("ZombieAccessibilityService", "注入事件失败: ${e.message}")
            false
        }
    }
}