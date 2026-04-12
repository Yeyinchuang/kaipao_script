package com.example.zombieassistant

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Rect
import android.os.Environment
import android.util.Log
import com.googlecode.tesseract.android.TessBaseAPI
import org.opencv.android.Utils
import org.opencv.core.Core
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.imgproc.Imgproc
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.util.*

class ImageRecognition(private val context: Context) {

    init {
        // 加载OpenCV库
        System.loadLibrary(Core.NATIVE_LIBRARY_NAME)
    }

    // 模板缓存
    private val templateCache = mutableMapOf<String, Bitmap>()
    // Tesseract OCR实例
    private lateinit var tessBaseAPI: TessBaseAPI
    // 场景识别缓存
    private var lastScene: SceneType = SceneType.UNKNOWN
    private var lastSceneTime: Long = 0

    /**
     * 初始化Tesseract OCR
     */
    fun initOCR() {
        try {
            val tessDataPath = context.filesDir.absolutePath + "/tessdata"
            val tessDataDir = File(tessDataPath)
            if (!tessDataDir.exists()) {
                tessDataDir.mkdirs()
            }
            
            // 复制语言包到tessdata目录
            copyTessData()
            
            tessBaseAPI = TessBaseAPI()
            val success = tessBaseAPI.init(tessDataPath, "chi_sim")
            if (success) {
                Log.d("ImageRecognition", "Tesseract OCR初始化成功")
            } else {
                Log.e("ImageRecognition", "Tesseract OCR初始化失败")
            }
        } catch (e: Exception) {
            Log.e("ImageRecognition", "OCR初始化出错: ${e.message}")
        }
    }

    /**
     * 复制Tesseract语言包到应用目录
     */
    private fun copyTessData() {
        try {
            val tessDataPath = context.filesDir.absolutePath + "/tessdata"
            val chiSimFile = File(tessDataPath, "chi_sim.traineddata")
            
            if (!chiSimFile.exists()) {
                Log.d("ImageRecognition", "正在复制Tesseract语言包...")
                val inputStream: InputStream? = context.assets.open("tessdata/chi_sim.traineddata")
                if (inputStream != null) {
                    val outputStream = FileOutputStream(chiSimFile)
                    val buffer = ByteArray(1024)
                    var length: Int
                    while (inputStream.read(buffer).also { length = it } > 0) {
                        outputStream.write(buffer, 0, length)
                    }
                    inputStream.close()
                    outputStream.close()
                    Log.d("ImageRecognition", "Tesseract语言包复制成功")
                } else {
                    Log.e("ImageRecognition", "未找到Tesseract语言包")
                }
            }
        } catch (e: Exception) {
            Log.e("ImageRecognition", "复制Tesseract语言包出错: ${e.message}")
        }
    }

    /**
     * 从资源中加载模板图像
     */
    fun loadTemplate(templateName: String): Bitmap? {
        // 检查缓存
        if (templateCache.containsKey(templateName)) {
            return templateCache[templateName]
        }

        // 根据模板名称加载对应资源
        val resourceId = getTemplateResourceId(templateName)
        if (resourceId == 0) {
            Log.e("ImageRecognition", "未找到模板: $templateName")
            return null
        }

        val bitmap = BitmapFactory.decodeResource(context.resources, resourceId)
        templateCache[templateName] = bitmap
        return bitmap
    }

    /**
     * 根据模板名称获取资源ID
     */
    private fun getTemplateResourceId(templateName: String): Int {
        val resourceName = templateName.lowercase().replace("_", "")
        return context.resources.getIdentifier(
            resourceName, "drawable", context.packageName
        )
    }

    /**
     * 模板匹配 - 支持多尺度
     * @param source 源图像
     * @param templateName 模板名称
     * @param threshold 匹配阈值
     * @param region 搜索区域 (x1, y1, x2, y2)
     * @return 匹配结果，包含匹配位置和相似度
     */
    fun matchTemplate(source: Bitmap, templateName: String, threshold: Double = 0.8, region: Rect? = null): MatchResult {
        val template = loadTemplate(templateName)
        if (template == null) {
            return MatchResult(0, 0, 0.0)
        }

        val sourceMat = Mat(source.height, source.width, CvType.CV_8UC4)
        Utils.bitmapToMat(source, sourceMat)

        // 处理区域
        val regionMat = if (region != null) {
            val x1 = maxOf(0, region.left)
            val y1 = maxOf(0, region.top)
            val x2 = minOf(source.width, region.right)
            val y2 = minOf(source.height, region.bottom)
            if (x1 >= x2 || y1 >= y2) {
                sourceMat
            } else {
                sourceMat.submat(y1, y2, x1, x2)
            }
        } else {
            sourceMat
        }

        var maxVal = -1.0
        var maxLocX = 0
        var maxLocY = 0
        var bestScale = 1.0

        // 多尺度匹配
        val scales = arrayOf(0.8, 0.9, 1.0, 1.1)
        for (scale in scales) {
            try {
                // 调整模板大小
                val resizedTemplate = Bitmap.createScaledBitmap(
                    template, 
                    (template.width * scale).toInt(),
                    (template.height * scale).toInt(),
                    true
                )

                val templateMat = Mat(resizedTemplate.height, resizedTemplate.width, CvType.CV_8UC4)
                Utils.bitmapToMat(resizedTemplate, templateMat)

                // 确保模板不大于源图像
                if (templateMat.height > regionMat.height || templateMat.width > regionMat.width) {
                    templateMat.release()
                    continue
                }

                // 执行模板匹配
                val resultMat = Mat(
                    regionMat.height - templateMat.height + 1,
                    regionMat.width - templateMat.width + 1,
                    CvType.CV_32FC1
                )

                Imgproc.matchTemplate(regionMat, templateMat, resultMat, Imgproc.TM_CCOEFF_NORMED)

                val minMaxLoc = Core.minMaxLoc(resultMat)
                val localMaxVal = minMaxLoc.maxVal

                if (localMaxVal > maxVal) {
                    maxVal = localMaxVal
                    maxLocX = minMaxLoc.maxLoc.x.toInt()
                    maxLocY = minMaxLoc.maxLoc.y.toInt()
                    bestScale = scale
                }

                templateMat.release()
                resultMat.release()
            } catch (e: Exception) {
                Log.e("ImageRecognition", "模板匹配出错: ${e.message}")
            }
        }

        // 计算中心点位置
        val templateWidth = (template.width * bestScale).toInt()
        val templateHeight = (template.height * bestScale).toInt()
        val centerX = maxLocX + templateWidth / 2
        val centerY = maxLocY + templateHeight / 2

        // 转换到原始图像坐标
        val finalX = if (region != null) centerX + region.left else centerX
        val finalY = if (region != null) centerY + region.top else centerY

        sourceMat.release()

        return MatchResult(finalX, finalY, maxVal)
    }

    /**
     * 查找所有匹配的模板位置
     * @param source 源图像
     * @param templateName 模板名称
     * @param threshold 匹配阈值
     * @param region 搜索区域
     * @return 所有匹配位置的列表
     */
    fun findAllTemplates(source: Bitmap, templateName: String, threshold: Double = 0.7, region: Rect? = null): List<MatchResult> {
        val template = loadTemplate(templateName)
        if (template == null) {
            return emptyList()
        }

        val sourceMat = Mat(source.height, source.width, CvType.CV_8UC4)
        Utils.bitmapToMat(source, sourceMat)

        // 处理区域
        val regionMat = if (region != null) {
            val x1 = maxOf(0, region.left)
            val y1 = maxOf(0, region.top)
            val x2 = minOf(source.width, region.right)
            val y2 = minOf(source.height, region.bottom)
            if (x1 >= x2 || y1 >= y2) {
                sourceMat
            } else {
                sourceMat.submat(y1, y2, x1, x2)
            }
        } else {
            sourceMat
        }

        val results = mutableListOf<MatchResult>()

        // 多尺度匹配
        val scales = arrayOf(0.8, 0.9, 1.0, 1.1)
        for (scale in scales) {
            try {
                // 调整模板大小
                val resizedTemplate = Bitmap.createScaledBitmap(
                    template, 
                    (template.width * scale).toInt(),
                    (template.height * scale).toInt(),
                    true
                )

                val templateMat = Mat(resizedTemplate.height, resizedTemplate.width, CvType.CV_8UC4)
                Utils.bitmapToMat(resizedTemplate, templateMat)

                // 确保模板不大于源图像
                if (templateMat.height > regionMat.height || templateMat.width > regionMat.width) {
                    templateMat.release()
                    continue
                }

                // 执行模板匹配
                val resultMat = Mat(
                    regionMat.height - templateMat.height + 1,
                    regionMat.width - templateMat.width + 1,
                    CvType.CV_32FC1
                )

                Imgproc.matchTemplate(regionMat, templateMat, resultMat, Imgproc.TM_CCOEFF_NORMED)

                // 找到所有匹配位置
                val locs = Core.findNonZero(resultMat)
                if (locs != null) {
                    for (i in 0 until locs.rows()) {
                        val point = locs.get(i, 0)
                        val x = point[0].toInt()
                        val y = point[1].toInt()
                        
                        // 计算中心点位置
                        val centerX = x + templateMat.width() / 2
                        val centerY = y + templateMat.height() / 2
                        
                        // 转换到原始图像坐标
                        val finalX = if (region != null) centerX + region.left else centerX
                        val finalY = if (region != null) centerY + region.top else centerY
                        
                        results.add(MatchResult(finalX, finalY, resultMat.get(y, x)[0]))
                    }
                }

                templateMat.release()
                resultMat.release()
            } catch (e: Exception) {
                Log.e("ImageRecognition", "查找模板出错: ${e.message}")
            }
        }

        sourceMat.release()

        // 去重 - 合并相近的位置
        return removeDuplicates(results)
    }

    /**
     * 去重相似的匹配结果
     */
    private fun removeDuplicates(results: List<MatchResult>): List<MatchResult> {
        val uniqueResults = mutableListOf<MatchResult>()
        
        for (result in results) {
            var isDuplicate = false
            for (unique in uniqueResults) {
                if (Math.abs(result.x - unique.x) < 20 && Math.abs(result.y - unique.y) < 20) {
                    isDuplicate = true
                    break
                }
            }
            if (!isDuplicate) {
                uniqueResults.add(result)
            }
        }
        
        return uniqueResults
    }

    /**
     * 文字识别
     * @param bitmap 待识别的图像
     * @param region 识别区域
     * @return 识别结果
     */
    fun recognizeText(bitmap: Bitmap, region: Rect? = null): String {
        try {
            if (!this::tessBaseAPI.isInitialized) {
                initOCR()
            }
            
            val cropBitmap = if (region != null) {
                Bitmap.createBitmap(bitmap, region.left, region.top, region.width(), region.height())
            } else {
                bitmap
            }
            
            tessBaseAPI.setImage(cropBitmap)
            val result = tessBaseAPI.utF8Text
            Log.d("ImageRecognition", "文字识别结果: $result")
            return result
        } catch (e: Exception) {
            Log.e("ImageRecognition", "文字识别出错: ${e.message}")
            return ""
        }
    }

    /**
     * 检测场景
     * @param screenshot 屏幕截图
     * @return 场景类型
     */
    fun detectScene(screenshot: Bitmap): SceneType {
        // 检查缓存
        val currentTime = System.currentTimeMillis()
        if (currentTime - lastSceneTime < 2000) {
            return lastScene
        }

        try {
            // 检测完成图标
            val completeTurnResult = matchTemplate(screenshot, "complete_turn_icon")
            if (completeTurnResult.confidence > 0.8) {
                lastScene = SceneType.COMPLETE_TURN_ICON
                lastSceneTime = currentTime
                return SceneType.COMPLETE_TURN_ICON
            }

            // 检测主界面
            val mainMenuResult = matchTemplate(screenshot, "main_menu")
            if (mainMenuResult.confidence > 0.8) {
                lastScene = SceneType.MAIN_MENU
                lastSceneTime = currentTime
                return SceneType.MAIN_MENU
            }

            val coreMenuResult = matchTemplate(screenshot, "core_menu")
            if (coreMenuResult.confidence > 0.8) {
                lastScene = SceneType.MAIN_MENU
                lastSceneTime = currentTime
                return SceneType.MAIN_MENU
            }

            val legionMenuResult = matchTemplate(screenshot, "legion_menu")
            if (legionMenuResult.confidence > 0.8) {
                lastScene = SceneType.MAIN_MENU
                lastSceneTime = currentTime
                return SceneType.MAIN_MENU
            }

            val characterMenuResult = matchTemplate(screenshot, "charactpr_menu")
            if (characterMenuResult.confidence > 0.8) {
                lastScene = SceneType.MAIN_MENU
                lastSceneTime = currentTime
                return SceneType.MAIN_MENU
            }

            val mallMenuResult = matchTemplate(screenshot, "mall_menu")
            if (mallMenuResult.confidence > 0.8) {
                lastScene = SceneType.MAIN_MENU
                lastSceneTime = currentTime
                return SceneType.MAIN_MENU
            }

            // 检测基地页面
            val baseMenuResult = matchTemplate(screenshot, "base_menu")
            if (baseMenuResult.confidence > 0.8) {
                lastScene = SceneType.BASE_MENU
                lastSceneTime = currentTime
                return SceneType.BASE_MENU
            }

            // 检测基地页面（文字识别）
            val baseText = recognizeText(screenshot, Rect(0, screenshot.height / 3, screenshot.width, screenshot.height * 2 / 3))
            if (baseText.contains("历练大厅") || baseText.contains("怪物嘉年华") || baseText.contains("远征堡垒")) {
                lastScene = SceneType.BASE_MENU
                lastSceneTime = currentTime
                return SceneType.BASE_MENU
            }

            // 检测训练大厅
            val trainingHallMenuResult = matchTemplate(screenshot, "training_hall_menu")
            if (trainingHallMenuResult.confidence > 0.9) {
                lastScene = SceneType.TRAINING_HALL
                lastSceneTime = currentTime
                return SceneType.TRAINING_HALL
            }

            // 检测训练大厅（文字识别）
            val trainingText = recognizeText(screenshot, Rect(0, 0, screenshot.width, screenshot.height / 3))
            if (trainingText.contains("深渊挑战") || trainingText.contains("环球救援") || trainingText.contains("环球远征")) {
                lastScene = SceneType.TRAINING_HALL
                lastSceneTime = currentTime
                return SceneType.TRAINING_HALL
            }

            // 检测游戏房间
            val teamHallIconResult = matchTemplate(screenshot, "team_hall_icon")
            if (teamHallIconResult.confidence > 0.9) {
                lastScene = SceneType.GAME_ROOM
                lastSceneTime = currentTime
                return SceneType.GAME_ROOM
            }

            // 检测游戏房间（文字识别）
            val gameRoomText = recognizeText(screenshot, Rect(0, 0, screenshot.width, screenshot.height / 4))
            if (gameRoomText.contains("环球救援") && gameRoomText.contains("难度")) {
                lastScene = SceneType.GAME_ROOM
                lastSceneTime = currentTime
                return SceneType.GAME_ROOM
            }

            // 检测组队大厅
            val teamHallTagResult = matchTemplate(screenshot, "team_hall_tag")
            if (teamHallTagResult.confidence > 0.9) {
                lastScene = SceneType.TEAM_HALL
                lastSceneTime = currentTime
                return SceneType.TEAM_HALL
            }

            // 检测组队大厅（文字识别）
            val teamHallText = recognizeText(screenshot, Rect(0, 0, screenshot.width, screenshot.height / 4))
            if (teamHallText.contains("招募频道")) {
                lastScene = SceneType.TEAM_HALL
                lastSceneTime = currentTime
                return SceneType.TEAM_HALL
            }

            // 检测战斗状态
            val inBattleResult = matchTemplate(screenshot, "in_battle")
            if (inBattleResult.confidence > 0.8) {
                lastScene = SceneType.IN_BATTLE
                lastSceneTime = currentTime
                return SceneType.IN_BATTLE
            }

            val beginCompleteResult = matchTemplate(screenshot, "begin_complete")
            if (beginCompleteResult.confidence > 0.8) {
                lastScene = SceneType.IN_BATTLE1
                lastSceneTime = currentTime
                return SceneType.IN_BATTLE1
            }

            // 检测环球救援挑战
            val globalRescueResult = matchTemplate(screenshot, "global_rescue")
            if (globalRescueResult.confidence > 0.8) {
                lastScene = SceneType.GLOBAL_EXPEDITION
                lastSceneTime = currentTime
                return SceneType.GLOBAL_EXPEDITION
            }

            // 检测环球救援挑战（文字识别）
            val globalRescueText = recognizeText(screenshot, Rect(0, 0, screenshot.width, screenshot.height / 3))
            if (globalRescueText.contains("环球救援") && globalRescueText.contains("挑战")) {
                lastScene = SceneType.GLOBAL_EXPEDITION
                lastSceneTime = currentTime
                return SceneType.GLOBAL_EXPEDITION
            }

        } catch (e: Exception) {
            Log.e("ImageRecognition", "场景检测出错: ${e.message}")
        }

        lastScene = SceneType.UNKNOWN
        lastSceneTime = currentTime
        return SceneType.UNKNOWN
    }

    /**
     * 识别招募信息
     * @param screenshot 屏幕截图
     * @return 招募信息列表
     */
    fun recognizeRecruitmentInfo(screenshot: Bitmap): List<RecruitmentInfo> {
        val recruitmentList = mutableListOf<RecruitmentInfo>()
        
        try {
            // 识别招募频道区域的文字
            val recruitmentText = recognizeText(screenshot, Rect(0, screenshot.height / 4, screenshot.width, screenshot.height * 3 / 4))
            
            // 解析招募信息
            val lines = recruitmentText.split("\n")
            var currentInfo: RecruitmentInfo? = null
            
            for (line in lines) {
                val trimmedLine = line.trim()
                if (trimmedLine.isEmpty()) continue
                
                // 检测服务器信息
                if (trimmedLine.contains("服")) {
                    if (currentInfo != null) {
                        recruitmentList.add(currentInfo)
                    }
                    currentInfo = RecruitmentInfo(server = trimmedLine)
                } 
                // 检测难度信息
                else if (trimmedLine.contains("难度")) {
                    currentInfo?.difficulty = trimmedLine
                }
                // 检测玩家信息
                else if (trimmedLine.contains("级")) {
                    currentInfo?.playerInfo = trimmedLine
                }
            }
            
            if (currentInfo != null) {
                recruitmentList.add(currentInfo)
            }
            
        } catch (e: Exception) {
            Log.e("ImageRecognition", "识别招募信息出错: ${e.message}")
        }
        
        return recruitmentList
    }

    /**
     * 匹配结果数据类
     */
    data class MatchResult(val x: Int, val y: Int, val confidence: Double)

    /**
     * 招募信息数据类
     */
    data class RecruitmentInfo(
        var server: String = "",
        var difficulty: String = "",
        var playerInfo: String = "",
        var joinButton: MatchResult? = null
    )

    /**
     * 场景类型枚举
     */
    enum class SceneType {
        MAIN_MENU,
        BASE_MENU,
        TRAINING_HALL,
        GLOBAL_EXPEDITION,
        GAME_ROOM,
        TEAM_HALL,
        IN_BATTLE,
        COMBAT_PREPARE,
        WEAPON_SELECT,
        SKILL_SELECT,
        DIFFICULTY_SELECT,
        COMPLETE_TURN_ICON,
        IN_BATTLE1,
        UNKNOWN
    }
}