package com.example.zombieassistant

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Rect
import android.util.Log
import java.util.*

class TaskManager(private val context: Context, private val accessibilityService: ZombieAccessibilityService) {

    private val tasks = mutableListOf<Task>()
    private var isRunning = false
    private val imageRecognition = ImageRecognition(context)
    private var currentState: TaskState = TaskState.IDLE
    private var lastStateChangeTime: Long = 0
    private var taskSettings: TaskSettings? = null

    init {
        // 初始化OCR
        imageRecognition.initOCR()
        
        // 加载配置
        val configManager = ConfigManager.getInstance(context)
        val taskConfig = configManager.getTaskConfig()
        taskSettings = TaskSettings(
            daily = taskConfig.daily,
            main = taskConfig.main,
            rescue = taskConfig.rescue,
            expedition = taskConfig.expedition,
            countLimit = taskConfig.countLimit,
            teamTimeout = taskConfig.teamTimeout
        )
        initTasks(taskSettings!!)
    }

    /**
     * 初始化任务
     */
    fun initTasks(settings: TaskSettings) {
        taskSettings = settings
        tasks.clear()
        
        if (settings.daily) {
            tasks.add(DailyTask())
        }
        if (settings.main) {
            tasks.add(MainTask())
        }
        if (settings.rescue) {
            tasks.add(RescueTask())
        }
        if (settings.expedition) {
            tasks.add(ExpeditionTask())
        }
    }

    /**
     * 开始执行任务
     */
    fun startTasks() {
        isRunning = true
        currentState = TaskState.INIT
        lastStateChangeTime = System.currentTimeMillis()
        
        Thread {
            while (isRunning) {
                try {
                    // 检测当前场景
                    val screenshot = accessibilityService.takeScreenshot()
                    if (screenshot != null) {
                        val sceneType = imageRecognition.detectScene(screenshot)
                        Log.d("TaskManager", "当前场景: ${sceneType.name}, 当前状态: ${currentState.name}")
                        
                        // 状态机处理
                        processStateMachine(sceneType, screenshot)
                    }
                    
                    // 延迟一段时间
                    Thread.sleep(1000)
                } catch (e: Exception) {
                    val errorHandler = ErrorHandler.getInstance(context)
                    errorHandler.handleException(e, "TaskManager")
                    Thread.sleep(3000)
                }
            }
        }.start()
    }

    /**
     * 状态机处理
     */
    private fun processStateMachine(sceneType: ImageRecognition.SceneType, screenshot: Bitmap) {
        val currentTime = System.currentTimeMillis()
        
        // 状态转换
        when (currentState) {
            TaskState.INIT -> {
                // 初始化状态，进入主菜单处理
                currentState = TaskState.MAIN_MENU
                lastStateChangeTime = currentTime
            }
            TaskState.MAIN_MENU -> {
                if (sceneType == ImageRecognition.SceneType.MAIN_MENU) {
                    mainMenuActions()
                    currentState = TaskState.BASE_MENU
                    lastStateChangeTime = currentTime
                } else if (sceneType == ImageRecognition.SceneType.BASE_MENU) {
                    // 已经在基地页面，直接进入基地处理
                    currentState = TaskState.BASE_MENU
                    lastStateChangeTime = currentTime
                } else if (currentTime - lastStateChangeTime > 10000) {
                    // 超时，尝试返回主菜单
                    handleTimeout()
                }
            }
            TaskState.BASE_MENU -> {
                if (sceneType == ImageRecognition.SceneType.BASE_MENU) {
                    baseMenuActions()
                    currentState = TaskState.TRAINING_HALL
                    lastStateChangeTime = currentTime
                } else if (sceneType == ImageRecognition.SceneType.TRAINING_HALL) {
                    // 已经在训练大厅，直接进入训练大厅处理
                    currentState = TaskState.TRAINING_HALL
                    lastStateChangeTime = currentTime
                } else if (currentTime - lastStateChangeTime > 10000) {
                    // 超时，尝试返回主菜单
                    handleTimeout()
                }
            }
            TaskState.TRAINING_HALL -> {
                if (sceneType == ImageRecognition.SceneType.TRAINING_HALL) {
                    trainingHallActions(screenshot)
                    currentState = TaskState.GAME_ROOM
                    lastStateChangeTime = currentTime
                } else if (sceneType == ImageRecognition.SceneType.GAME_ROOM) {
                    // 已经在游戏房间，直接进入游戏房间处理
                    currentState = TaskState.GAME_ROOM
                    lastStateChangeTime = currentTime
                } else if (currentTime - lastStateChangeTime > 10000) {
                    // 超时，尝试返回主菜单
                    handleTimeout()
                }
            }
            TaskState.GAME_ROOM -> {
                if (sceneType == ImageRecognition.SceneType.GAME_ROOM) {
                    gameRoomActions(screenshot)
                    currentState = TaskState.TEAM_HALL
                    lastStateChangeTime = currentTime
                } else if (sceneType == ImageRecognition.SceneType.TEAM_HALL) {
                    // 已经在组队大厅，直接进入组队大厅处理
                    currentState = TaskState.TEAM_HALL
                    lastStateChangeTime = currentTime
                } else if (sceneType == ImageRecognition.SceneType.IN_BATTLE || sceneType == ImageRecognition.SceneType.IN_BATTLE1) {
                    // 进入战斗状态
                    currentState = TaskState.BATTLE
                    lastStateChangeTime = currentTime
                } else if (currentTime - lastStateChangeTime > 10000) {
                    // 超时，尝试返回主菜单
                    handleTimeout()
                }
            }
            TaskState.TEAM_HALL -> {
                if (sceneType == ImageRecognition.SceneType.TEAM_HALL) {
                    teamHallActions(screenshot)
                    currentState = TaskState.BATTLE
                    lastStateChangeTime = currentTime
                } else if (sceneType == ImageRecognition.SceneType.IN_BATTLE || sceneType == ImageRecognition.SceneType.IN_BATTLE1) {
                    // 进入战斗状态
                    currentState = TaskState.BATTLE
                    lastStateChangeTime = currentTime
                } else if (currentTime - lastStateChangeTime > 10000) {
                    // 超时，尝试返回主菜单
                    handleTimeout()
                }
            }
            TaskState.BATTLE -> {
                if (sceneType == ImageRecognition.SceneType.IN_BATTLE || sceneType == ImageRecognition.SceneType.IN_BATTLE1) {
                    battleActions(screenshot)
                    // 战斗状态持续处理
                } else if (sceneType == ImageRecognition.SceneType.COMPLETE_TURN_ICON) {
                    // 战斗结束，处理结算
                    handleCompleteTurn()
                    currentState = TaskState.MAIN_MENU
                    lastStateChangeTime = currentTime
                } else if (currentTime - lastStateChangeTime > 60000) {
                    // 战斗超时，尝试退出
                    handleBattleTimeout()
                }
            }
            TaskState.IDLE -> {
                // 空闲状态，等待任务开始
            }
        }
    }

    /**
     * 处理超时
     */
    private fun handleTimeout() {
        Log.d("TaskManager", "处理超时，尝试返回主菜单")
        backButtonClick()
        currentState = TaskState.MAIN_MENU
        lastStateChangeTime = System.currentTimeMillis()
    }

    /**
     * 处理战斗超时
     */
    private fun handleBattleTimeout() {
        Log.d("TaskManager", "战斗超时，尝试退出")
        backButtonClick()
        currentState = TaskState.MAIN_MENU
        lastStateChangeTime = System.currentTimeMillis()
    }

    /**
     * 处理结算返回
     */
    private fun handleCompleteTurn() {
        Log.d("TaskManager", "处理结算返回")
        accessibilityService.smartClick("complete_turn_icon", offset = Pair(5, 5), retry = 2)
        try {
            Thread.sleep(2000)
        } catch (e: InterruptedException) {
            e.printStackTrace()
        }
    }

    /**
     * 主菜单操作
     */
    private fun mainMenuActions() {
        Log.d("TaskManager", "执行主界面操作: 进入基地")
        accessibilityService.smartClick("base_icon", offset = Pair(10, 10), retry = 2)
        try {
            Thread.sleep(2000)
        } catch (e: InterruptedException) {
            e.printStackTrace()
        }
    }

    /**
     * 基地菜单操作
     */
    private fun baseMenuActions() {
        Log.d("TaskManager", "执行基地页面操作: 进入历练大厅")
        
        // 使用文字识别找到历练大厅
        val screenshot = accessibilityService.takeScreenshot()
        if (screenshot != null) {
            val baseText = imageRecognition.recognizeText(screenshot, Rect(0, screenshot.height / 3, screenshot.width, screenshot.height * 2 / 3))
            Log.d("TaskManager", "基地页面文字: $baseText")
            
            if (baseText.contains("历练大厅")) {
                // 找到历练大厅位置并点击
                val trainingHallResult = imageRecognition.matchTemplate(screenshot, "training_hall_icon")
                if (trainingHallResult.confidence > 0.7) {
                    Log.d("TaskManager", "找到历练大厅图标，点击进入")
                    accessibilityService.smartClick(position = Pair(trainingHallResult.x, trainingHallResult.y), offset = Pair(5, 5))
                } else {
                    // 尝试点击文字位置附近
                    Log.d("TaskManager", "未找到历练大厅图标，尝试点击文字位置")
                    val screenWidth = accessibilityService.getScreenWidth()
                    val screenHeight = accessibilityService.getScreenHeight()
                    val trainingHallX = screenWidth * 3 / 4
                    val trainingHallY = screenHeight * 2 / 3
                    accessibilityService.smartClick(position = Pair(trainingHallX.toInt(), trainingHallY.toInt()))
                }
            } else {
                Log.d("TaskManager", "未找到历练大厅文字，尝试默认位置")
                accessibilityService.smartClick("training_hall_icon", offset = Pair(5, 5), retry = 2)
            }
        } else {
            Log.d("TaskManager", "无法获取屏幕截图，尝试默认位置")
            accessibilityService.smartClick("training_hall_icon", offset = Pair(5, 5), retry = 2)
        }
        
        try {
            Thread.sleep(2000)
        } catch (e: InterruptedException) {
            e.printStackTrace()
        }
    }

    /**
     * 训练大厅操作
     */
    private fun trainingHallActions(screenshot: Bitmap) {
        Log.d("TaskManager", "执行历练大厅操作: 查找环球救援")
        
        // 使用文字识别找到环球救援
        val trainingText = imageRecognition.recognizeText(screenshot, Rect(0, 0, screenshot.width, screenshot.height / 3))
        Log.d("TaskManager", "训练大厅文字: $trainingText")
        
        if (trainingText.contains("环球救援")) {
            Log.d("TaskManager", "找到环球救援文字")
            
            // 查找环球救援的挑战按钮
            val screenWidth = accessibilityService.getScreenWidth()
            val screenHeight = accessibilityService.getScreenHeight()
            val searchRegion = Rect(
                0, 
                screenshot.height / 3, 
                screenWidth, 
                screenHeight
            )
            
            // 查找挑战标识
            val challengeResults = imageRecognition.findAllTemplates(screenshot, "challenge_icon", 0.7, searchRegion)
            if (challengeResults.isNotEmpty()) {
                // 按y坐标排序，选择最上面的挑战标识
                challengeResults.sortBy { it.y }
                val firstChallenge = challengeResults[0]
                
                Log.d("TaskManager", "找到 ${challengeResults.size} 个挑战标识，选择最上面的: (${firstChallenge.x}, ${firstChallenge.y})")
                accessibilityService.smartClick(position = Pair(firstChallenge.x, firstChallenge.y))
                try {
                    Thread.sleep(3000)
                } catch (e: InterruptedException) {
                    e.printStackTrace()
                }
            } else {
                Log.d("TaskManager", "未找到挑战标识，尝试直接点击环球救援区域")
                val rescueX = screenWidth / 2
                val rescueY = screenshot.height / 2
                accessibilityService.smartClick(position = Pair(rescueX, rescueY))
                try {
                    Thread.sleep(3000)
                } catch (e: InterruptedException) {
                    e.printStackTrace()
                }
            }
        } else {
            // 如果找不到，尝试滚动查找
            Log.d("TaskManager", "未找到环球救援文字，尝试滚动屏幕")
            for (i in 0 until 3) {
                accessibilityService.smartScroll("down", 400)
                try {
                    Thread.sleep(1000)
                } catch (e: InterruptedException) {
                    e.printStackTrace()
                }
                
                val newScreenshot = accessibilityService.takeScreenshot()
                if (newScreenshot != null) {
                    val newTrainingText = imageRecognition.recognizeText(newScreenshot, Rect(0, 0, newScreenshot.width, newScreenshot.height / 3))
                    if (newTrainingText.contains("环球救援")) {
                        Log.d("TaskManager", "滚动后找到环球救援文字")
                        
                        // 查找挑战标识
                        val screenWidth = accessibilityService.getScreenWidth()
                        val searchRegion = Rect(
                            0, 
                            newScreenshot.height / 3, 
                            screenWidth, 
                            newScreenshot.height
                        )
                        
                        val challengeResults = imageRecognition.findAllTemplates(newScreenshot, "challenge_icon", 0.7, searchRegion)
                        if (challengeResults.isNotEmpty()) {
                            // 按y坐标排序，选择最上面的挑战标识
                            challengeResults.sortBy { it.y }
                            val firstChallenge = challengeResults[0]
                            
                            Log.d("TaskManager", "找到 ${challengeResults.size} 个挑战标识，选择最上面的: (${firstChallenge.x}, ${firstChallenge.y})")
                            accessibilityService.smartClick(position = Pair(firstChallenge.x, firstChallenge.y))
                            try {
                                Thread.sleep(3000)
                            } catch (e: InterruptedException) {
                                e.printStackTrace()
                            }
                        } else {
                            Log.d("TaskManager", "未找到挑战标识，尝试直接点击环球救援区域")
                            val rescueX = screenWidth / 2
                            val rescueY = newScreenshot.height / 2
                            accessibilityService.smartClick(position = Pair(rescueX, rescueY))
                            try {
                                Thread.sleep(3000)
                            } catch (e: InterruptedException) {
                                e.printStackTrace()
                            }
                        }
                        return
                    }
                }
            }
            Log.d("TaskManager", "多次滚动后仍未找到环球救援文字")
            backButtonClick()
        }
    }

    /**
     * 游戏房间操作
     */
    private fun gameRoomActions(screenshot: Bitmap) {
        Log.d("TaskManager", "执行游戏房间操作: 进入组队大厅流程")
        
        // 检测准备按钮
        val readyResult = imageRecognition.matchTemplate(screenshot, "ready_button")
        if (readyResult.confidence > 0.8) {
            Log.d("TaskManager", "检测到准备按钮，直接点击准备")
            accessibilityService.smartClick(position = Pair(readyResult.x, readyResult.y), offset = Pair(5, 5))
            
            // 等待准备完成
            val maxWait = 10
            var waitCount = 0
            while (waitCount < maxWait && isRunning) {
                try {
                    Thread.sleep(3000)
                } catch (e: InterruptedException) {
                    e.printStackTrace()
                }
                waitCount++
                Log.d("TaskManager", "等待 $waitCount/$maxWait")
                
                val newScreenshot = accessibilityService.takeScreenshot()
                if (newScreenshot != null) {
                    val readyCompleteResult = imageRecognition.matchTemplate(newScreenshot, "ready_complete_icon")
                    val completeTurnResult = imageRecognition.matchTemplate(newScreenshot, "complete_turn_icon")
                    val hp100Results = imageRecognition.findAllTemplates(newScreenshot, "hp100_icon")
                    
                    if (readyCompleteResult.confidence > 0.8) {
                        Log.d("TaskManager", "准备成功，等待进入战斗")
                        continue
                    } else if (hp100Results.isNotEmpty()) {
                        Log.d("TaskManager", "找到hp100图标，执行点击")
                        clickAll(hp100Results)
                    } else if (completeTurnResult.confidence > 0.8) {
                        Log.d("TaskManager", "找到完成图标，执行点击")
                        accessibilityService.smartClick(position = Pair(completeTurnResult.x, completeTurnResult.y), offset = Pair(5, 5))
                    } else {
                        Log.d("TaskManager", "没准备成功，退出等待循环")
                        break
                    }
                }
            }
        } else {
            // 尝试进入组队流程
            if (!enterTeamFlow()) {
                Log.d("TaskManager", "无法进入组队流程，返回上一级")
                backButtonClick()
            }
        }
    }

    /**
     * 组队流程
     */
    private fun enterTeamFlow(): Boolean {
        Log.d("TaskManager", "执行组队大厅操作流程")
        
        // 检测组队大厅图标
        val screenshot = accessibilityService.takeScreenshot()
        if (screenshot != null) {
            val teamHallResult = imageRecognition.matchTemplate(screenshot, "team_hall_icon")
            if (teamHallResult.confidence > 0.8) {
                Log.d("TaskManager", "检测到组队大厅图标，点击进入组队大厅")
                accessibilityService.smartClick(position = Pair(teamHallResult.x, teamHallResult.y), offset = Pair(5, 5))
                
                // 检测快速加入按钮
                val maxCount = 3
                var count = 0
                while (count < maxCount && isRunning) {
                    try {
                        Thread.sleep(1000)
                    } catch (e: InterruptedException) {
                        e.printStackTrace()
                    }
                    count++
                    
                    val newScreenshot = accessibilityService.takeScreenshot()
                    if (newScreenshot != null) {
                        val quickJoinResult = imageRecognition.matchTemplate(newScreenshot, "quick_join_icon")
                        if (quickJoinResult.confidence > 0.8) {
                            Log.d("TaskManager", "检测到快速加入按钮，点击加入")
                            accessibilityService.smartClick(position = Pair(quickJoinResult.x, quickJoinResult.y), offset = Pair(10, 10))
                            return true
                        }
                    }
                }
            }
        }
        Log.d("TaskManager", "未找到组队大厅图标")
        return false
    }

    /**
     * 组队大厅操作
     */
    private fun teamHallActions(screenshot: Bitmap) {
        Log.d("TaskManager", "执行组队大厅操作")
        
        // 使用文字识别识别招募信息
        val recruitmentInfoList = imageRecognition.recognizeRecruitmentInfo(screenshot)
        if (recruitmentInfoList.isNotEmpty()) {
            Log.d("TaskManager", "找到 ${recruitmentInfoList.size} 条招募信息")
            
            // 选择第一条招募信息并点击加入
            for (info in recruitmentInfoList) {
                Log.d("TaskManager", "招募信息: 服务器=${info.server}, 难度=${info.difficulty}, 玩家=${info.playerInfo}")
                
                // 查找加入按钮
                val joinButtonResults = imageRecognition.findAllTemplates(screenshot, "join_button")
                if (joinButtonResults.isNotEmpty()) {
                    // 按y坐标排序，选择最上面的加入按钮
                    joinButtonResults.sortBy { it.y }
                    val firstJoinButton = joinButtonResults[0]
                    
                    Log.d("TaskManager", "找到加入按钮，点击加入")
                    accessibilityService.smartClick(position = Pair(firstJoinButton.x, firstJoinButton.y), offset = Pair(5, 5))
                    try {
                        Thread.sleep(2000)
                    } catch (e: InterruptedException) {
                        e.printStackTrace()
                    }
                    return
                }
            }
        } else {
            Log.d("TaskManager", "未找到招募信息")
            // 尝试点击招募频道中的其他位置
            val screenWidth = accessibilityService.getScreenWidth()
            val screenHeight = accessibilityService.getScreenHeight()
            val centerX = screenWidth / 2
            val centerY = screenHeight * 2 / 3
            accessibilityService.smartClick(position = Pair(centerX, centerY))
            try {
                Thread.sleep(1000)
            } catch (e: InterruptedException) {
                e.printStackTrace()
            }
        }
    }

    /**
     * 战斗操作
     */
    private fun battleActions(screenshot: Bitmap) {
        Log.d("TaskManager", "执行战斗操作")
        
        // 查找hp100图标并点击
        val hp100Results = imageRecognition.findAllTemplates(screenshot, "hp100_icon")
        if (hp100Results.isNotEmpty()) {
            Log.d("TaskManager", "找到 ${hp100Results.size} 个hp100图标")
            clickAll(hp100Results)
        }
        
        // 查找开始战斗按钮
        val beginFightingResult = imageRecognition.matchTemplate(screenshot, "begin_fighting")
        if (beginFightingResult.confidence > 0.8) {
            Log.d("TaskManager", "找到开始战斗按钮")
            accessibilityService.smartClick(position = Pair(beginFightingResult.x, beginFightingResult.y), offset = Pair(5, 5))
        }
        
        // 查找关闭战斗按钮
        val closeFightingResult = imageRecognition.matchTemplate(screenshot, "close_fighting")
        if (closeFightingResult.confidence > 0.8) {
            Log.d("TaskManager", "找到关闭战斗按钮")
            accessibilityService.smartClick(position = Pair(closeFightingResult.x, closeFightingResult.y), offset = Pair(5, 5))
        }
    }

    /**
     * 点击所有位置
     */
    private fun clickAll(results: List<ImageRecognition.MatchResult>) {
        for (result in results) {
            accessibilityService.smartClick(position = Pair(result.x, result.y), offset = Pair(5, -20))
            try {
                Thread.sleep(500)
            } catch (e: InterruptedException) {
                e.printStackTrace()
            }
        }
    }

    /**
     * 点击返回按钮
     */
    private fun backButtonClick() {
        Log.d("TaskManager", "点击返回按钮")
        accessibilityService.smartClick("back_button", offset = Pair(10, 10), retry = 2)
        try {
            Thread.sleep(1000)
        } catch (e: InterruptedException) {
            e.printStackTrace()
        }
    }

    /**
     * 处理未知状态
     */
    private fun handleUnknownState() {
        Log.d("TaskManager", "未知界面，尝试安全操作")
        
        // 尝试返回按钮
        if (accessibilityService.smartClick("back_button", offset = Pair(10, 10), retry = 2)) {
            try {
                Thread.sleep(1000)
            } catch (e: InterruptedException) {
                e.printStackTrace()
            }
            return
        }
        
        // 尝试点击屏幕中央
        val screenWidth = accessibilityService.getScreenWidth()
        val screenHeight = accessibilityService.getScreenHeight()
        val centerX = screenWidth / 2
        val centerY = screenHeight / 2
        accessibilityService.smartClick(position = Pair(centerX, centerY))
        try {
            Thread.sleep(1000)
        } catch (e: InterruptedException) {
            e.printStackTrace()
        }
        Log.d("TaskManager", "执行安全点击操作")
    }

    /**
     * 停止执行任务
     */
    fun stopTasks() {
        isRunning = false
        Log.d("TaskManager", "停止执行任务")
    }

    /**
     * 任务设置数据类
     */
    data class TaskSettings(
        val daily: Boolean,
        val main: Boolean,
        val rescue: Boolean,
        val expedition: Boolean,
        val countLimit: Int,
        val teamTimeout: Int
    )

    /**
     * 任务接口
     */
    interface Task {
        fun execute(accessibilityService: ZombieAccessibilityService)
    }

    /**
     * 日常副本任务
     */
    class DailyTask : Task {
        override fun execute(accessibilityService: ZombieAccessibilityService) {
            Log.d("TaskManager", "执行日常副本任务")
            // 实现日常副本逻辑
        }
    }

    /**
     * 主线关卡任务
     */
    class MainTask : Task {
        override fun execute(accessibilityService: ZombieAccessibilityService) {
            Log.d("TaskManager", "执行主线关卡任务")
            // 实现主线关卡逻辑
        }
    }

    /**
     * 寰球救援任务
     */
    class RescueTask : Task {
        override fun execute(accessibilityService: ZombieAccessibilityService) {
            Log.d("TaskManager", "执行寰球救援任务")
            // 实现寰球救援逻辑
        }
    }

    /**
     * 寰球远征任务
     */
    class ExpeditionTask : Task {
        override fun execute(accessibilityService: ZombieAccessibilityService) {
            Log.d("TaskManager", "执行寰球远征任务")
            // 实现寰球远征逻辑
        }
    }

    /**
     * 任务状态枚举
     */
    enum class TaskState {
        IDLE,           // 空闲状态
        INIT,           // 初始化状态
        MAIN_MENU,      // 主菜单状态
        BASE_MENU,      // 基地菜单状态
        TRAINING_HALL,  // 训练大厅状态
        GAME_ROOM,      // 游戏房间状态
        TEAM_HALL,      // 组队大厅状态
        BATTLE          // 战斗状态
    }
}