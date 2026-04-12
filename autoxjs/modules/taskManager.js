/**
 * 任务管理模块 - 状态机驱动的游戏自动化
 */

function TaskManager(config, imageRecognition, debugInfo) {
    this.config = config || {};
    this.imageRecognition = imageRecognition;
    this.debugInfo = debugInfo || {};  // 悬浮窗调试信息引用
    this.currentState = "IDLE";
    this.isRunning = false;
    this.lastStateChangeTime = 0;
    this.battleStartTime = 0; // 战斗开始时间，用于10分钟超时判断
    this.taskThread = null;
    this.lastActionTime = 0; // 上次操作时间戳（间隔重试用）

    // 任务设置
    var taskConfig = config.task || {};
    this.taskSettings = {
        daily: taskConfig.daily !== false,
        main: taskConfig.main !== false,
        rescue: taskConfig.rescue !== false,
        expedition: taskConfig.expedition !== false,
        countLimit: taskConfig.countLimit || 100,
        teamTimeout: taskConfig.teamTimeout || 300
    };

    // 操作设置
    var opConfig = config.operation || {};
    this.opSettings = {
        clickDelay: opConfig.clickDelay || 500,
        swipeDuration: opConfig.swipeDuration || 500,
        retryCount: opConfig.retryCount || 3
    };
}

/**
 * 更新调试信息（通过引用直接修改，供悬浮窗读取）
 */
TaskManager.prototype._updateDebugInfo = function (state, scene, loop, unknown) {
    if (!this.debugInfo) return;
    this.debugInfo.state = state || "-";
    this.debugInfo.scene = scene || "-";
    this.debugInfo.loopCount = loop || 0;
    this.debugInfo.unknownCount = unknown || 0;
    if (scene && scene !== "UNKNOWN" && scene !== "-") {
        this.debugInfo.lastAction = "检测: " + scene;
    }
};

/**
 * 启动任务循环
 */
TaskManager.prototype.start = function () {
    if (this.isRunning) return;

    this.isRunning = true;
    this.currentState = "INIT";
    this.lastStateChangeTime = Date.now();

    log("========== 任务管理器启动 ==========");
    log("当前状态: " + this.currentState);
    toast("任务已启动: 初始化中");

    var self = this;
    var loopCount = 0;
    var unknownCount = 0;  // 连续未知计数
    this.taskThread = threads.start(function () {
        while (self.isRunning) {
            loopCount++;
            try {
                log("--- 第 " + loopCount + " 次循环 [状态:" + self.currentState + "] ---");

                var screenshot = self.imageRecognition.captureScreen();
                if (!screenshot) {
                    log("[警告] 截图失败！请检查截图权限或屏幕是否关闭");
                    toast("⚠ 截图失败！请检查权限");
                    self._updateDebugInfo(self.currentState, "截图失败", loopCount, unknownCount);
                    sleep(2000);
                    continue;
                }
                log("截图成功, 尺寸: " + screenshot.getWidth() + "x" + screenshot.getHeight());

                var sceneType = self.imageRecognition.detectScene(screenshot);
                log(">>> 场景检测结果: " + sceneType + " | 当前状态: " + self.currentState);

                // 统计连续 UNKNOWN 次数
                if (sceneType === "UNKNOWN") {
                    unknownCount++;
                    log("[!!] 连续第 " + unknownCount + " 次 UNKNOWN");
                    if (unknownCount >= 3) {
                        toast("⚠ 无法识别屏幕(连续" + unknownCount + "次)\n请确认游戏在前台");
                        if (unknownCount % 5 === 0) {
                            log("!!! 已连续 " + unknownCount + " 次无法识别场景！");
                        }
                    }
                } else {
                    unknownCount = 0;
                }

                // 更新悬浮窗调试信息（每次都更新）
                self._updateDebugInfo(self.currentState, sceneType, loopCount, unknownCount);

                self.processStateMachine(sceneType, screenshot);
                screenshot.recycle();
                sleep(1000);
            } catch (e) {
                log("[错误] 任务执行出错: " + e.message);
                log("[错误] 堆栈: " + e.stack || "");
                sleep(3000);
            }
        }
        log("========== 任务管理器停止 ==========");
    });
};

/**
 * 停止任务
 */
TaskManager.prototype.stop = function () {
    this.isRunning = false;
    this.currentState = "IDLE";
    if (this.taskThread) {
        this.taskThread.interrupt();
        this.taskThread = null;
    }
    log("任务已停止");
};

/**
 * 获取当前状态显示文本
 */
TaskManager.prototype.getCurrentState = function () {
    var stateMap = {
        "IDLE": "待机",
        "INIT": "初始化",
        "MAIN_MENU": "主菜单",
        "BASE_MENU": "基地",
        "TRAINING_HALL": "历练大厅",
        "GAME_ROOM": "游戏房间",
        "TEAM_HALL": "组队大厅",
        "BATTLE": "战斗中",
        "GLOBAL_EXPEDITION": "环球远征"
    };
    return stateMap[this.currentState] || this.currentState;
};

/**
 * 状态机处理 — 场景驱动架构
 *
 * 核心原则：
 *   1. 每个状态只做两件事：
 *      - 场景匹配 → 执行该状态的操作（不决定下一个状态）
 *      - 场景不匹配 → 跟随场景切换到对应状态
 *   2. 操作之后不硬编码 currentState，由下一帧的场景检测结果自然流转
 *   3. 操作间隔重试：场景匹配后执行操作，间隔N秒后若场景未变则重试（应对卡顿/点击无效）
 */
TaskManager.prototype.processStateMachine = function (sceneType, screenshot) {
    var currentTime = Date.now();
    log("  [状态机] 当前: " + this.currentState + " | 场景: " + sceneType);

    switch (this.currentState) {

        // ==================== INIT ====================
        case "INIT":
            log("  [状态机] INIT -> MAIN_MENU (立即切换)");
            this._switchState("MAIN_MENU", currentTime);
            toast("→ 进入主菜单检测");
            break;

        // ==================== MAIN_MENU ====================
        case "MAIN_MENU":
            if (this._tryFollowScene(sceneType, currentTime, ["COMPLETE_TURN"])) return;
            if (sceneType === "MAIN_MENU") {
                if (this._shouldRetryAction(currentTime, 5000)) {
                    toast("✓ 识别到主菜单，点击基地");
                    this.mainMenuActions();
                }
            } else if (currentTime - this.lastStateChangeTime > 15000) {
                log("  [状态机] MAIN_MENU 超时15s，处理超时");
                toast("⏰ 主菜单检测超时，重试");
                this._handleTimeoutAndReset(currentTime, "MAIN_MENU");
            }
            break;

        // ==================== BASE_MENU ====================
        case "BASE_MENU":
            if (this._tryFollowScene(sceneType, currentTime)) return;
            if (sceneType === "BASE_MENU") {
                if (this._shouldRetryAction(currentTime, 5000)) {
                    toast("✓ 识别到基地，进入历练大厅");
                    this.baseMenuActions(screenshot);
                }
            } else if (currentTime - this.lastStateChangeTime > 15000) {
                log("  [状态机] BASE_MENU 超时15s，处理超时");
                toast("⏰ 基地检测超时，重试");
                this._handleTimeoutAndReset(currentTime, "MAIN_MENU");
            }
            break;

        // ==================== TRAINING_HALL ====================
        case "TRAINING_HALL":
            if (this._tryFollowScene(sceneType, currentTime)) return;
            if (sceneType === "TRAINING_HALL") {
                if (this._shouldRetryAction(currentTime, 5000)) {
                    this.trainingHallActions(screenshot);
                }
            } else if (currentTime - this.lastStateChangeTime > 20000) {
                log("  [状态机] TRAINING_HALL 超时20s，处理超时");
                this._handleTimeoutAndReset(currentTime, "MAIN_MENU");
            }
            break;

        // ==================== GAME_ROOM ====================
        case "GAME_ROOM":
            if (this._tryFollowScene(sceneType, currentTime, ["TEAM_HALL", "JINGYING_BATTLE", "HUANQIU_BATTLE", "COMPLETE_TURN"])) return;
            if (sceneType === "GAME_ROOM") {
                if (this._shouldRetryAction(currentTime, 5000)) {
                    toast("✓ 游戏房间，执行操作");
                    this.gameRoomActions(screenshot);
                }
            } else if (currentTime - this.lastStateChangeTime > 25000) {
                log("  [状态机] GAME_ROOM 超时25s，处理超时");
                this._handleTimeoutAndReset(currentTime, "MAIN_MENU");
            }
            break;

        // ==================== TEAM_HALL ====================
        case "TEAM_HALL":
            if (this._tryFollowScene(sceneType, currentTime)) return;
            if (sceneType === "TEAM_HALL") {
                if (this._shouldRetryAction(currentTime, 8000)) {
                    this.teamHallActions(screenshot);
                }
            } else if (currentTime - this.lastStateChangeTime > 35000) {
                log("  [状态机] TEAM_HALL 超时35s，处理超时");
                this._handleTimeoutAndReset(currentTime, "MAIN_MENU");
            }
            break;

        // ==================== BATTLE ====================
        case "BATTLE":
            // 首次进入BATTLE状态，记录开始时间
            if (this.battleStartTime === 0) {
                this.battleStartTime = Date.now();
                log("  [状态机] 战斗计时开始: " + new Date().toLocaleTimeString());
            }

            if (sceneType === "JINGYING_BATTLE") {
                // ===== 精英战斗（非目标）→ 直接退出 =====
                var eliteElapsed = Date.now() - this.battleStartTime;
                log("  [状态机] ⚠ 检测到精英战斗(JINGYING_BATTLE)，立即退出！(" + Math.round(eliteElapsed / 1000) + "s)");
                toast("⚠ 误入精英战斗，正在退出...");
                this._exitUnwantedBattle(screenshot);
                this.battleStartTime = 0;
                this._switchState("TEAM_HALL", currentTime);

            } else if (sceneType === "HUANQIU_BATTLE") {
                // ===== 寰球救援战斗（目标）→ 正常打 =====
                var battleElapsed = Date.now() - this.battleStartTime;
                // 超时保护：超过10分钟也退出
                if (battleElapsed > 600000) {
                    log("  [状态机] ⚠ 战斗已进行 " + Math.round(battleElapsed / 1000) + "s，超过10分钟，主动退出！");
                    toast("战斗超时10分钟，正在退出...");
                    this._exitUnwantedBattle(screenshot);
                    this.battleStartTime = 0;
                    this._switchState("TEAM_HALL", currentTime);
                    break;
                }
                // OCR识别战斗界面文字（复用于时间解析）
                var battleText = this.imageRecognition.recognizeText(screenshot);
                if (battleText) {
                    var timeMatch = battleText.match(/(\d{1,2})[:：](\d{2})/);
                    if (timeMatch) {
                        log("  [战斗] 已用时: " + timeMatch[1] + ":" + timeMatch[2] +
                            " (后台计: " + Math.round(battleElapsed / 1000) + "s)");
                    }
                }
                log("  [状态机] 正常战斗中（寰球救援），执行 battleActions");
                this.battleActions(screenshot, battleText);

            } else if (sceneType === "COMPLETE_TURN") {
                // 战斗结束出结算 → 切到COMPLETE_TURN状态
                log("  [状态机] BATTLE中检测到结算页 -> 切到 COMPLETE_TURN");
                toast("⚡ 战斗结束，进入结算处理");
                this.battleStartTime = 0;
                this._switchState("COMPLETE_TURN", currentTime);
            } else if (currentTime - this.lastStateChangeTime > 60000) {
                log("  [状态机] BATTLE 超时60s，处理战斗超时");
                this.handleBattleTimeout();
            } else {
                // 战斗中但场景不是JINGYING_BATTLE/HUANQIU_BATTLE（可能是弹窗等短暂遮挡），跟随场景
                log("  [状态机] BATTLE状态但场景为 " + sceneType + "，跟随切换");
                this._switchState(sceneType, currentTime);
            }
            break;

        // ==================== COMPLETE_TURN ====================
        case "COMPLETE_TURN":
            if (sceneType === "COMPLETE_TURN") {
                if (this._shouldRetryAction(currentTime, 3000)) {
                    toast("⚡ 战斗结算完成，点击返回");
                    this.handleCompleteTurn();
                }
            } else {
                // 返回成功后场景变了，跟随切换到新场景
                log("  [状态机] 结算页已消失，场景变为 " + sceneType + "，跟随切换");
                this._switchState(sceneType, currentTime);
            }
            break;

        // ==================== IDLE ====================
        case "IDLE":
            break;
    }
};

// ==================== 状态机辅助方法 ====================

/**
 * 尝试跟随场景切换状态
 * 如果当前场景与状态不匹配，自动切换到对应状态并重置actionExecuted
 * @param {string} sceneType 当前检测到的场景
 * @param {number} currentTime 当前时间戳
 * @param {Array} extraAllowedScenes 额外允许跟随的场景列表（可选）
 * @returns {boolean} true=已跟随切换（调用方应return）, false=场景匹配无需跟随
 */
TaskManager.prototype._tryFollowScene = function (sceneType, currentTime, extraAllowedScenes) {
    // 场景与状态一致 → 匹配，不需要跟随
    if (sceneType === this.currentState) return false;

    // 特殊场景在任何状态下都优先跟随（全局拦截）
    var globalInterceptScenes = ["COMPLETE_TURN"];
    for (var i = 0; i < globalInterceptScenes.length; i++) {
        if (sceneType === globalInterceptScenes[i]) {
            log("  [状态机] 全局拦截: " + sceneType + " -> 跟随切换");
            this._switchState(sceneType, currentTime);
            return true;
        }
    }

    // 额外允许的场景（如 JINGYING_BATTLE 从任何状态都应跳转）
    if (extraAllowedScenes && extraAllowedScenes.indexOf(sceneType) >= 0) {
        log("  [状态机] 场景变为 " + sceneType + "，跟随切换");
        this._switchState(sceneType, currentTime);
        return true;
    }

    // 其他场景不匹配 → 也跟随切换（通用兜底）
    log("  [状态机] 场景变为 " + sceneType + "（非预期），跟随切换");
    this._switchState(sceneType, currentTime);
    return true;
};

/**
 * 切换状态并重置操作计时
 * @param {string} newState 新状态名
 * @param {number} currentTime 当前时间戳
 */
TaskManager.prototype._switchState = function (newState, currentTime) {
    if (newState === this.currentState) return;
    log("  [状态机] >>> " + this.currentState + " -> " + newState);
    this.currentState = newState;
    this.lastStateChangeTime = currentTime;
    this.lastActionTime = 0; // 新状态重置，允许立即执行首次操作
};

/**
 * 判断是否应该执行/重试操作（间隔重试机制）
 * 首次执行：lastActionTime === 0 → 允许
 * 后续重试：距离上次操作超过 intervalMs → 允许
 * 用途：应对点击无效、卡顿、网络延迟等情况
 *
 * @param {number} currentTime 当前时间戳
 * @param {number} intervalMs 重试间隔（毫秒），如 5000=5秒后可再点
 * @returns {boolean} true=应该执行操作, false=还在冷却中
 */
TaskManager.prototype._shouldRetryAction = function (currentTime, intervalMs) {
    if (!this.lastActionTime || this.lastActionTime === 0) {
        // 首次执行
        this.lastActionTime = currentTime;
        return true;
    }
    var elapsed = currentTime - this.lastActionTime;
    if (elapsed >= intervalMs) {
        log("  [状态机] 距离上次操作已" + Math.round(elapsed / 1000) + "s，重试");
        this.lastActionTime = currentTime;
        return true;
    }
    return false; // 冷却中，不重复执行
};

/**
 * 处理超时：返回上一级并重置
 * @param {number} currentTime 当前时间戳
 * @param {string} fallbackState 兜底状态
 */
TaskManager.prototype._handleTimeoutAndReset = function (currentTime, fallbackState) {
    this.backButtonClick();
    this._switchState(fallbackState, currentTime);
};

// ==================== 各状态操作 ====================

/**
 * 通过 OCR 文字点击（优先），降级为模板点击
 */
TaskManager.prototype.clickByText = function (targetText, fallbackTemplate, region) {
    log("  [操作] 尝试点击文字: '" + targetText + "' (降级模板: " + fallbackTemplate + ")");
    var screenshot = this.imageRecognition.captureScreen();
    if (!screenshot) {
        log("  [操作] 截图失败，无法点击文字");
        return false;
    }

    var pos = this.imageRecognition.findTextPosition(screenshot, targetText, 0.7, region);
    if (pos && pos.x > 0 && pos.y > 0) {
        log("  [操作] ✓ OCR找到文字[" + targetText + "]，位置: (" + pos.x + ", " + pos.y + ")");
        this.smartClick(pos.x, pos.y);
        screenshot.recycle();
        return true;
    }

    log("  [操作] ✗ OCR未找到'" + targetText + "'，降级到模板: " + fallbackTemplate);
    screenshot.recycle();
    return this.clickTemplate(fallbackTemplate);
};

/**
 * 主菜单操作 - 点击基地图标（多重策略）
 * 策略优先级: 1.当前截图OCR找"基地"  2.模板匹配base_icon  3.导航栏坐标估算
 */
TaskManager.prototype.mainMenuActions = function () {
    log(">>> 执行 mainMenuActions: 进入基地");
    toast("操作: 进入基地");

    var screenshot = this.imageRecognition.captureScreen();
    if (!screenshot) {
        log("  [主菜单] 截图失败，跳过");
        return;
    }

    var clicked = false;
    var sw = device.width || 720;
    var sh = device.height || 1280;

    // 策略1: 在底部导航栏区域查找"基地"（限制区域避免全屏其他文字干扰）
    // 导航栏在底部约10%-20%范围
    var navRegion = {
        x: Math.floor(sw * 0.1), y: Math.floor(sh * 0.88),
        width: Math.floor(sw * 0.8), height: Math.floor(sh * 0.12)
    };
    log("  [主菜单] 导航栏搜索区域: x=" + navRegion.x + ", y=" + navRegion.y +
        ", w=" + navRegion.width + ", h=" + navRegion.height);

    // OCR可能把"基地"识别成"其地"，尝试多种写法
    // 注意：只用raw(原始彩色图)和normal预处理，不用lightText(会崩溃)
    var baseVariants = ["基地", "其地"];
    for (var bi = 0; bi < baseVariants.length && !clicked; bi++) {
        // 先用缓存查找
        var pos = this.imageRecognition.findTextPosition(screenshot, baseVariants[bi], 0.6, navRegion, false);
        if (pos && pos.x > 0 && pos.y > 0) {
            log("  [主菜单] ✓ OCR找到'" + baseVariants[bi] + "', 位置: (" + pos.x + ", " + pos.y + ")");
            this.smartClick(pos.x, pos.y);
            clicked = true;
        }
        // 不再逐个尝试所有preprocessing模式，太慢且lightText崩溃
        // 如果raw没找到就跳过这个variant，直接到下一步策略
    }
    if (!clicked) {
        log("  [主菜单] ✗ OCR未找到'基地'(阈值0.6, 区域搜索)");
    }
    screenshot.recycle();

    // 策略2: 模板匹配 base_icon
    if (!clicked) {
        clicked = this.clickTemplate("base_icon");
        if (clicked) {
            log("  [主菜单] ✓ 模板base_icon匹配成功");
        } else {
            log("  [主菜单] ✗ 模板base_icon未匹配");
        }
    }

    // 策略3: 坐标兜底 - 导航栏底部，"基地"是第5个(共7个)
    if (!clicked) {
        var navY = Math.floor(sh * 0.93);
        var navX = Math.floor(sw * 0.58); // 基地大约在导航栏中间偏右
        log("  [主菜单] 使用坐标兜底点击基地: (" + navX + ", " + navY + ")");
        click(navX, navY);
        sleep(this.opSettings.clickDelay);
    }

    log("<<< mainMenuActions 完成");
    sleep(2000);
};

/**
 * 基地菜单操作 - 进入历练大厅（支持滑动查找）
 * 策略: 全屏OCR找文字 → 没找到则滑动 → 再找 → 降级模板
 */
TaskManager.prototype.baseMenuActions = function (screenshot) {
    log(">>> 执行 baseMenuActions: 进入历练大厅");
    toast("操作: 进入历练大厅");

    // 策略1: 直接全屏OCR查找"历练大厅"（不限区域）
    if (this.clickByText("历练大厅", "training_hall_icon")) {
        log("<<< baseMenuActions 完成 (直接点击)");
        sleep(2000);
        return;
    }

    // 策略2: 没找到，尝试滑动后再次查找（历练大厅可能在可视区外）
    log("  [基地] 未直接找到'历练大厅'，尝试滑动查找...");
    for (var i = 0; i < 3; i++) {
        this.smartScroll("up", 300); // 向上滑动（基地建筑从下往上排列）
        sleep(1000);

        var newScreenshot = this.imageRecognition.captureScreen();
        if (!newScreenshot) continue;

        // 滑动后再用全屏OCR找
        var pos = this.imageRecognition.findTextPosition(newScreenshot, "历练大厅", 0.6);
        if (pos && pos.x > 0 && pos.y > 0) {
            log("  [基地] 滑动后找到'历练大厅', 位置: (" + pos.x + ", " + pos.y + ")");
            this.smartClick(pos.x, pos.y);
            newScreenshot.recycle();
            log("<<< baseMenuActions 完成 (滑动后点击)");
            sleep(2000);
            return;
        }
        newScreenshot.recycle();
    }

    // 策略3: OCR始终找不到，降级模板匹配
    log("  [基地] 滑动后仍未找到，降级模板匹配");
    this.clickTemplate("training_hall_icon");
    log("<<< baseMenuActions 完成 (模板兜底)");
    sleep(2000);
};

/**
 * 历练大厅操作 - 查找寰球救援并进入
 * 优化：复用 detectScene 的OCR缓存，避免重复调用 paddle.ocr()
 */
TaskManager.prototype.trainingHallActions = function (screenshot) {
    log(">>> 执行 trainingHallActions: 查找寰球救援");
    toast("操作: 查找寰球救援");

    var screenHeight = screenshot.getHeight();
    var screenWidth = screenshot.getWidth();

    // 步骤1：获取全屏文字（优先用缓存，零额外开销）
    var trainingText = this.imageRecognition.recognizeTextInRegion(screenshot, null, false);
    log("训练大厅文字(" + (trainingText||"").length + "字): " + (trainingText || "").substring(0, 200));

    // 兼容"寰球救援"和"环球救援"
    if ((trainingText || "").indexOf("寰球救援") >= 0 || (trainingText || "").indexOf("环球救援") >= 0) {
        log("找到寰球/环球救援文字，定位位置并点击挑战按钮");

        // 步骤2: 从缓存查找"寰球救援"坐标（零额外OCR！）
        // findTextPosition 现在会先查 _ocrBlocks 缓存，命中则直接返回坐标
        var rescuePos = this.imageRecognition.findTextPosition(screenshot, "寰球救援", 0.6);
        if (!rescuePos || rescuePos.x <= 0) {
            rescuePos = this.imageRecognition.findTextPosition(screenshot, "环球救援", 0.6);
        }

        if (rescuePos && rescuePos.x > 0 && rescuePos.y > 0) {
            log("  [历练大厅] 寰球救援位置: (" + rescuePos.x + ", " + rescuePos.y + ")");

            // 步骤3: 在寰球救援卡片区域内搜索"挑战"按钮
            // 寻找 y > rescuePos.y 且最近的"挑战"文字（在卡片右下角）
            var challengePos = this._findChallengeBelow(rescuePos.y, screenWidth, screenHeight);
            if (challengePos) {
                this.smartClick(challengePos.x, challengePos.y);
                log("  [历练大厅] ✓ 点击挑战按钮 (" + challengePos.x + ", " + challengePos.y + ")");
            } else {
                log("  [历练大厅] 未找到挑战按钮，降级模板");
                this.clickTemplate("challenge_icon");
            }
        } else {
            log("  [历练大厅] 无法定位寰球救援坐标");
            this.clickByText("挑战", "challenge_icon");
        }
        sleep(3000);
    } else {
        // 尝试滚动查找
        log("未找到寰球救援文字，尝试滚动");
        for (var i = 0; i < 3; i++) {
            this.smartScroll("down", 400);
            sleep(1000);

            var newScreenshot = this.imageRecognition.captureScreen();
            if (newScreenshot) {
                // 全屏搜索（不限制区域）
                var newText = this.imageRecognition.recognizeTextInRegion(newScreenshot, null, false);
                if ((newText || "").indexOf("寰球救援") >= 0 || (newText || "").indexOf("环球救援") >= 0) {
                    log("滚动后找到寰球救援");
                    this.clickByText("挑战", "challenge_icon");
                    newScreenshot.recycle();
                    sleep(3000);
                    return;
                }
                newScreenshot.recycle();
            }
        }
        log("多次滚动后仍未找到寰球救援");
        this.backButtonClick();
    }
};

/**
 * 游戏房间操作 - 在房间内处理
 * 流程: 点击hp100冒泡图标进入队伍 → 尝试点击"开始游戏" → 无目标则退出回招募
 */
TaskManager.prototype.gameRoomActions = function (screenshot) {
    log(">>> 执行 gameRoomActions: 处理房间内操作");
    toast("操作: 游戏房间处理");

    var clicked = false;

    // 步骤1: 点击房间冒泡（进入实际战斗房间/队伍）
    var hpResults = this.imageRecognition.findAllTemplates(screenshot, "hp100_icon");
    if (hpResults.length > 0) {
        log("  [游戏房间] 找到 " + hpResults.length + " 个 hp100 冒泡，点击进入");
        this.clickAllPositions(hpResults);
        clicked = true;
        sleep(2000);
    }

    // 步骤2: 如果已在房间里，尝试点击"开始游戏"
    var startGamePos = this.imageRecognition.findTextPosition(screenshot, "开始游戏", 0.7, null, false);
    if (startGamePos && startGamePos.x > 0) {
        log("  [游戏房间] ✓ 找到'开始游戏'按钮，点击开始");
        click(startGamePos.x, startGamePos.y);
        clicked = true;
        sleep(2000);
    }

    // 步骤3: 没可操作目标，退出回招募列表
    if (!clicked) {
        log("  [游戏房间] 无可操作目标，返回招募列表");
        var recruitPos = this.imageRecognition.findTextPosition(screenshot, "招募", 0.7, null, false);
        if (recruitPos && recruitPos.x > 0) {
            click(recruitPos.x, recruitPos.y);
        } else {
            click(Math.floor(screenshot.getWidth() * 0.07), Math.floor(screenshot.getHeight() * 0.95));
        }
        sleep(1500);
    }

    log("<<< gameRoomActions 完成");
};

/**
 * 组队流程
 */
TaskManager.prototype.enterTeamFlow = function () {
    log("执行组队大厅操作流程");

    var screenshot = this.imageRecognition.captureScreen();
    if (!screenshot) return false;

    var teamHallResult = this.imageRecognition.matchTemplate(screenshot, "team_hall_icon", 0.8);
    if (teamHallResult.found) {
        log("检测到组队大厅图标，点击进入");
        this.smartClick(teamHallResult.x + 5, teamHallResult.y + 5);

        // 检测快速加入按钮
        for (var i = 0; i < 3 && this.isRunning; i++) {
            sleep(1000);
            var newScreenshot = this.imageRecognition.captureScreen();
            if (!newScreenshot) continue;

            var quickJoinResult = this.imageRecognition.matchTemplate(newScreenshot, "quick_join_icon", 0.8);
            newScreenshot.recycle();
            if (quickJoinResult.found) {
                log("检测到快速加入按钮，点击加入");
                this.smartClick(quickJoinResult.x + 10, quickJoinResult.y + 10);
                screenshot.recycle();
                return true;
            }
        }
    }
    screenshot.recycle();
    log("未找到组队大厅图标");
    return false;
};

/**
 * 高频点击最下方房间加入（15秒持续狂点）
 * 抢房成功后自动检测并关闭"方案配置"弹窗
 * @param {Image} screenshot 当前截图
 */
TaskManager.prototype._spamClickJoinButtons = function (screenshot) {
    var sw = screenshot.getWidth();
    var sh = screenshot.getHeight();

    // 只点最下方的房间卡片居中("多人挑战"区域)
    var targetX = Math.floor(sw * 0.55);
    var targetY = Math.floor(sh * 0.700);

    // 持续狂点15秒（每批20次 x 50ms = 1秒，循环15轮）
    var durationMs = 15000;
    var batchClicks = 20;
    var batchIntervalMs = 50;
    var endTime = Date.now() + durationMs;
    var startTime = Date.now(); // 记录开始时间，用于定时检查
    log("  [招募] 狂点最下方房间 (" + targetX + ", " + targetY + ")，持续" + (durationMs/1000) + "秒");

    while (Date.now() < endTime && this.isRunning) {
        for (var i = 0; i < batchClicks && Date.now() < endTime && this.isRunning; i++) {
            click(targetX + random(-5, 5), targetY + random(-5, 5));
            sleep(batchIntervalMs);
        }
        // 每5秒快速检查一次是否已进入真实战斗（仅用模板匹配，避免OCR误判"19级"等）
        if ((Date.now() - startTime) % 5000 < batchClicks * batchIntervalMs) {
            var quickCheck = this.imageRecognition.captureScreen();
            if (quickCheck) {
                var quickText = this.imageRecognition.recognizeText(quickCheck);
                quickCheck.recycle();
                // 必须同时有波次 才算真正进入战斗（避免房间内"19级"误判）
                if (quickText && quickText.indexOf("波次") >= 0) {
                    log("  [招募] ✓ 检测到'波次'，已进入真实战斗，停止抢房！");
                    break;
                }
            }
        }
    }

    toast("已尝试加入！");

    // 抢房后检测是否弹出"寰球救援方案"配置弹窗，用X按钮关闭
    sleep(800);
    var afterScreenshot = this.imageRecognition.captureScreen();
    if (afterScreenshot) {
        var closeResult = this.imageRecognition.matchTemplate(afterScreenshot, "close_plan_x", 0.7);
        if (closeResult.found) {
            log("  [招募] ✓ 检测到'方案配置'弹窗，点击X关闭: (" + closeResult.x + ", " + closeResult.y + ")");
            click(closeResult.x, closeResult.y);
            toast("已关闭配置弹窗");
        } else {
            log("  [招募] 未检测到方案配置弹窗");
        }
        afterScreenshot.recycle();
    }

    log("<<< _spamClickJoinButtons 完成");
};

/**
 * 招募频道操作 - 在组队频道中切换到招募tab，查找并加入别人的寰球救援房间
 * 核心原则：自己不开房（费道具），只抢别人房间加入
 * 流程: 确认在招募tab(精英/更改等特征词) → 高频点击加入
 * 注意: 如果进入GAME_ROOM，由状态机自动切换到gameRoomActions处理
 */
TaskManager.prototype.teamHallActions = function (screenshot) {
    log(">>> 执行 teamHallActions: 招募频道查找房间");

    var text = this.imageRecognition.recognizeText(screenshot);
    log("  [招募] OCR文字(" + (text||"").length + "字): " + (text || "(空)").substring(0, 200));

    // ========== 步骤1: 确认是否已在招募tab页面 ==========
    var isOnRecruitTab = this._isOnRecruitTab(text);

    if (!isOnRecruitTab) {
        log("  [招募] 未检测到招募tab特征，尝试切换到招募...");

        // 1a: 模板匹配优先找"招募"tab（左侧菜单灰色文字）
        var recruitResult = this.imageRecognition.matchTemplate(screenshot, "recruit_tab", 0.7);
        if (recruitResult.found) {
            log("  [招募] ✓ 模板匹配到'recruit_tab': (" + recruitResult.x + ", " + recruitResult.y + ")，点击切换");
            this.smartClick(recruitResult.x + 10, recruitResult.y + 15);
            sleep(1500);
            return;
        }

        // 1b: 降级OCR找"招募"文字（不用lightText避免崩溃）
        var recruitTabPos = this.imageRecognition.findTextPosition(screenshot, "招募", 0.7, null, false);
        if (recruitTabPos && recruitTabPos.x > 0) {
            log("  [招募] ✓ OCR找到'招募'tab: (" + recruitTabPos.x + ", " + recruitTabPos.y + ")，点击切换");
            this.smartClick(recruitTabPos.x, recruitTabPos.y);
            sleep(1500);
            return;
        }

        log("  [招募] ✗ 未找到'招募'tab（模板+OCR均失败）");
        return;
    }

    // ========== 步骤2: 已确认在招募tab → 直接按坐标抢房 ==========
    log("  [招募] ✓ 已在招募tab，直接抢房！(优先最下方房间)");
    this._spamClickJoinButtons(screenshot);
};

/**
 * 检测当前是否误入了 GAME_ROOM（别人的组队房间）
 * GAME_ROOM 特征: 有"开始游戏"+"邀请码"（如截图：寰球救援-难度18 + 开始游戏 + 邀请码）
 * @param {string} text OCR识别的文字
 * @returns {boolean}
 */
TaskManager.prototype._isInGameRoom = function (text) {
    if (!text || text.length < 5) return false;
    // GAME_ROOM 核心特征：同时有"开始游戏"和"邀请码"
    var hasStartGame = (text.indexOf("开始游戏") >= 0);
    var hasInviteCode = (text.indexOf("邀请码") >= 0);
    if (hasStartGame && hasInviteCode) {
        log("  [招募] 检测到GAME_ROOM(开始游戏+邀请码)，误入别人房间");
        return true;
    }
    // 兜底: 有"副本邀请"也说明在房间内
    if (text.indexOf("副本邀请") >= 0 && hasStartGame) {
        log("  [招募] 检测到GAME_ROOM(副本邀请+开始游戏)，误入别人房间");
        return true;
    }
    return false;
};

/**
 * 检查当前是否已在招募tab页面
 * 通过招募页面独有特征词判断: "精英"(筛选)/ "更改"(按钮)/ "快速加入"/ "加入》"
 * @param {string} text OCR识别的文字
 * @returns {boolean}
 */
TaskManager.prototype._isOnRecruitTab = function (text) {
    if (!text || text.length < 3) return false;
    // 招募列表底部筛选栏有"精英▼"和"更改"按钮，房间卡片有"多人挑战""加入》"
    var recruitFeatures = ["精英", "更改", "快速加人", "快速加入", "速度上车", "多人挑战"];
    for (var i = 0; i < recruitFeatures.length; i++) {
        if (text.indexOf(recruitFeatures[i]) >= 0) {
            log("  [招募] ✓ 确认在招募tab(检测到: " + recruitFeatures[i] + ")");
            return true;
        }
    }
    // 兜底: 有"加入"文字且在TEAM_HALL场景中大概率是招募列表
    if (text.indexOf("加入") >= 0 && text.indexOf("配置求助") >= 0) {
        log("  [招募] ✓ 确认在招募tab(检测到: 加入+配置求助)");
        return true;
    }
    return false;
};

/**
 * 检查OCR文字中是否有救援房间的招募信息（支持OCR各种变体）
 * OCR常见变体: 寰/环/豪/衰/赛/景/球 → 统一匹配 "救援-难度" 模式即可覆盖
 * @param {string} text OCR识别的文字
 * @returns {boolean}
 */
TaskManager.prototype._checkRescueRoomInText = function (text) {
    if (!text || text.length < 5) return false;
    // 策略: 用正则匹配 "X救援-难度N" 或 "X救援-难度" 模式，不依赖首字识别
    // 实际OCR输出如: "寰球救援-难度8" "衰球救援-难度12" "赛球救援-难度11"
    var rescuePattern = /[\u4e00-\u9fa5]*救援-难度\d*[\u4e00-\u9fa5]*/;
    var match = text.match(rescuePattern);
    if (match && match[0] && match[0].length >= 4) {
        log("  [招募] 招募列表发现: " + match[0]);
        return true;
    }

    // 兜底: 直接搜关键词变体（防止正则漏掉）
    var variants = ["寰球", "环球", "豪球", "衰球", "赛球", "景球", "寰球", "环球"];
    for (var i = 0; i < variants.length; i++) {
        if (text.indexOf(variants[i] + "救援") >= 0 || text.indexOf(variants[i] + "援-") >= 0) {
            log("  [招募] 招募列表发现(兜底): " + variants[i] + "救援");
            return true;
        }
    }
    return false;
};

/**
 * 检测当前是否为非目标战斗（需要退出的战斗）
 * 判断条件: OCR识别到 "寰球救援-难度数字" = 目标战斗；有"数字.地图名"但无此标记 = 非目标
 * @param {string} text OCR识别的文字
 * @returns {boolean} true=非目标战斗需退出, false=正常战斗(寰球救援)
 */
TaskManager.prototype._isUnwantedBattle = function (text) {
    if (!text || text.length < 3) return false;

    // 检查是否有 "寰球救援-难度XX" 或 "寰球救援难度XX" 格式 — 这是目标战斗的标志
    var rescuePattern = /寰球救援[—\-–]\s*\d+|寰球救援\s*难度\s*\d+/;
    if (rescuePattern.test(text)) {
        log("  [战斗] ✓ 检测到'寰球救援-难度X'，为目标战斗");
        return false; // 目标战斗，不退出
    }

    // 匹配 "数字.地图名" 格式，如 "30.地下甬道" "5.矿洞" 等
    // 有这种格式但无寰球救援 = 非目标战斗
    var mapPattern = /\d+\.[\u4e00-\u9fa5]+/;
    var mapMatch = text.match(mapPattern);
    if (mapMatch) {
        log("  [战斗] ⚠ 检测到地图(" + mapMatch[0] + ")但无'寰球救援-难度X'，判定为非目标战斗！");
        return true; // 非目标战斗 → 需要退出
    }

    // 其他情况无法判断，默认不退出
    return false;
};

/**
 * 退出非目标战斗：点击暂停(||) → 点击"退出"
 * 流程: 模板匹配暂停按钮 → 截图OCR找"退出"文字 → 点击退出 → 回到招募继续找房
 * @param {Image} screenshot 当前截图
 */
TaskManager.prototype._exitUnwantedBattle = function (screenshot) {
    log(">>> 执行 _exitUnwantedBattle: 退出非目标战斗（循环重试模式）");
    toast("⚠ 非目标战斗，正在退出...");

    var maxRetries = 6;  // 最大循环次数
    for (var attempt = 0; attempt < maxRetries && this.isRunning; attempt++) {
        log("  [退出] 第 " + (attempt + 1) + "/" + maxRetries + " 次尝试");

        // 步骤1: 先连续点击屏幕中央（关闭卡牌/技能选择弹窗）
        var sw = screenshot.getWidth();
        var sh = screenshot.getHeight();
        for (var i = 0; i < 5; i++) {
            click(sw / 2 + random(-20, 20), sh * 0.55 + random(-15, 15));
            sleep(200);
        }

        // 步骤2: 再点左上角暂停按钮
        for (var j = 0; j < 3; j++) {
            click(45 + random(-10, 10), 50 + random(-8, 8));
            sleep(200);
        }
        sleep(1500); // 等暂停菜单弹出

        // 步骤3: 截图检查是否出现暂停菜单
        var pauseScreen = this.imageRecognition.captureScreen();
        if (!pauseScreen) continue;

        // 步骤3: 尝试点"退出"
        var exitPos = this.imageRecognition.findTextPosition(pauseScreen, "退出", 0.7, null, false);
        if (exitPos && exitPos.x > 0) {
            log("  [退出] ✓ 找到'退出'按钮: (" + exitPos.x + ", " + exitPos.y + ")");
            click(exitPos.x, exitPos.y);
            toast("已退出非目标战斗");
            pauseScreen.recycle();

            sleep(2000);

            // 步骤4: 结果页点"返回"
            var resultScreen = this.imageRecognition.captureScreen();
            if (resultScreen) {
                var returnPos = this.imageRecognition.findTextPosition(resultScreen, "返回", 0.7, null, false);
                if (returnPos && returnPos.x > 0 && returnPos.y > 0) {
                    log("  [退出] ✓ 结果页找到'返回': (" + returnPos.x + ", " + returnPos.y + ")");
                    click(returnPos.x + random(-5, 5), returnPos.y + random(-5, 5));
                } else {
                    var tmplResult = this.imageRecognition.matchTemplate(resultScreen, "complete_turn_icon", 0.7);
                    if (tmplResult.found) {
                        click(tmplResult.x, tmplResult.y);
                        log("  [退出] ✓ 模板匹配到结算返回按钮");
                    }
                }
                resultScreen.recycle();
            }

            sleep(1500);
            log("<<< _exitUnwantedBattle 成功退出，回到TEAM_HALL");
            return;
        }

        // 没找到"退出"，可能被弹窗遮挡，继续循环
        log("  [退出] 未找到'退出'文字，可能有弹窗遮挡，下次循环继续...");
        pauseScreen.recycle();
    }

    log("<<< _exitUnwantedBattle 循环结束未成功退出");
};

/**
 * 战斗操作
 */
TaskManager.prototype.battleActions = function (screenshot, cachedText) {
    log(">>> 执行 battleActions: 战斗中");
    toast("操作: 战斗中");

    // ========== 优先检测：技能选择界面（"X 选择技能"，倒计时选技能）==========
    // 如截图所示：战斗中出现 "5 选择技能" 界面，需要疯狂点击中间选一个
    var battleText = cachedText || this.imageRecognition.recognizeText(screenshot);
    if (battleText && /[\d]+[\s]*选择技能/.test(battleText)) {
        log("  [战斗] ✓ 检测到'X 选择技能'界面，疯狂点击屏幕中间选择技能");
        var sw = screenshot.getWidth();
        var sh = screenshot.getHeight();
        var targetX = Math.floor(sw * 0.50);
        var targetY = Math.floor(sh * 0.58); // 屏幕中间偏下，技能卡片区域
        // 疯狂点击3秒，确保选中
        var skillEndTime = Date.now() + 3000;
        while (Date.now() < skillEndTime && this.isRunning) {
            click(targetX + random(-8, 8), targetY + random(-8, 8));
            sleep(50);
        }
        return; // 选完直接返回，等下一轮循环
    }

    // 查找 hp100 图标并点击（小图标保留模板匹配）
    var hp100Results = this.imageRecognition.findAllTemplates(screenshot, "hp100_icon");
    if (hp100Results.length > 0) {
        log("找到 " + hp100Results.length + " 个 hp100 图标");
        this.clickAllPositions(hp100Results);
    }

    // OCR 优先点击"开始游戏"
    if (!this.clickByText("开始游戏", "begin_fighting")) {
        // 降级模板匹配
        this.clickTemplate("begin_fighting");
    }

    // 关闭战斗界面
    this.clickTemplate("close_fighting");
};

// ==================== 辅助操作 ====================

/**
 * 从OCR缓存中查找目标文字下方的"挑战"按钮位置
 * 利用 detectScene 缓存的 _ocrBlocks，零额外OCR开销
 * @param {number} targetY 目标文字的y坐标（在其下方搜索）
 * @param {number} screenWidth 屏幕宽度
 * @param {number} screenHeight 屏幕高度
 * @returns {object|null} {x, y} 或 null
 */
TaskManager.prototype._findChallengeBelow = function (targetY, screenWidth, screenHeight) {
    var blocks = this.imageRecognition._ocrBlocks;
    if (!blocks || blocks.length === 0) return null;

    // 搜索范围：targetY 下方 ~35%屏幕高度（一个卡片的高度）
    var maxSearchY = targetY + Math.floor(screenHeight * 0.35);
    var bestMatch = null;

    for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        // 找"挑战"且在目标下方
        if ((b.text === "挑战" || b.text.indexOf("挑战") >= 0) &&
            b.y > targetY && b.y <= maxSearchY) {
            // 选第一个匹配的（从上往下扫描，第一个就是最近的）
            if (!bestMatch || b.y < bestMatch.y) {
                bestMatch = { x: b.x, y: b.y };
            }
        }
    }

    if (bestMatch) {
        log("  [历练大厅] 从缓存找到'挑战': (" + bestMatch.x + ", " + bestMatch.y +
            ", 在目标下方" + (bestMatch.y - targetY) + "px)");
    } else {
        log("  [历练大厅] 缓存中未找到目标下方的'挑战'");
    }
    return bestMatch;
};

/**
 * 智能点击（带随机偏移）
 */
TaskManager.prototype.smartClick = function (x, y) {
    var offsetX = random(-5, 5);
    var offsetY = random(-5, 5);
    click(x + offsetX, y + offsetY);
    sleep(this.opSettings.clickDelay);
};

/**
 * 智能滑动
 */
TaskManager.prototype.smartScroll = function (direction, distance) {
    var screenWidth = device.width;
    var screenHeight = device.height;
    var centerX = Math.floor(screenWidth / 2);

    if (direction === "down") {
        swipe(centerX, Math.floor(screenHeight * 3 / 4), centerX, Math.floor(screenHeight * 3 / 4) - distance, this.opSettings.swipeDuration);
    } else {
        swipe(centerX, Math.floor(screenHeight / 4), centerX, Math.floor(screenHeight / 4) + distance, this.opSettings.swipeDuration);
    }
    sleep(500);
};

/**
 * 点击所有位置
 */
TaskManager.prototype.clickAllPositions = function (positions) {
    for (var i = 0; i < positions.length; i++) {
        this.smartClick(positions[i].x + 5, positions[i].y - 20);
        sleep(500);
    }
};

/**
 * 通过模板名称点击
 */
TaskManager.prototype.clickTemplate = function (templateName) {
    var screenshot = this.imageRecognition.captureScreen();
    if (!screenshot) return false;

    var result = this.imageRecognition.matchTemplate(screenshot, templateName, 0.8);
    screenshot.recycle();

    if (result.found) {
        this.smartClick(result.x + 5, result.y + 5);
        return true;
    }
    return false;
};

/**
 * 点击返回按钮（使用游戏内返回图标，避免退到微信）
 */
TaskManager.prototype.backButtonClick = function () {
    log("点击游戏内返回按钮");
    // 优先用游戏内返回箭头图标模板
    if (!this.clickTemplate("back_button")) {
        // 模板没找到，尝试点击左上角常见返回位置
        log("返回图标模板未找到，尝试坐标点击左上角");
        click(50, 50);
    }
    sleep(1500);
};

/**
 * 处理超时
 */
TaskManager.prototype.handleTimeout = function () {
    log("  [超时] 处理超时，尝试返回主菜单 (当前状态: " + this.currentState + ")");
    this.backButtonClick();
    this._switchState("MAIN_MENU", Date.now());
};

/**
 * 处理战斗超时
 */
TaskManager.prototype.handleBattleTimeout = function () {
    log("战斗超时，尝试退出");
    this.backButtonClick();
    this._switchState("MAIN_MENU", Date.now());
};

/**
 * 处理结算返回：OCR识别"返回"按钮点击
 * 结算页底部有"返回"文字按钮（如截图所示）
 */
TaskManager.prototype.handleCompleteTurn = function () {
    log(">>> 处理结算返回：OCR识别'返回'按钮");
    var screenshot = this.imageRecognition.captureScreen();
    if (!screenshot) {
        log("  [结算] 截图失败，尝试模板匹配");
        this._clickReturnFallback();
        return;
    }

    // 策略1: OCR找"返回"文字
    var returnPos = this.imageRecognition.findTextPosition(screenshot, "返回", 0.7, null, false);
    if (returnPos && returnPos.x > 0 && returnPos.y > 0) {
        log("  [结算] ✓ OCR找到'返回'按钮: (" + returnPos.x + ", " + returnPos.y + ")");
        click(returnPos.x + random(-5, 5), returnPos.y + random(-5, 5));
        screenshot.recycle();
        sleep(2000);
        return;
    }

    log("  [结算] OCR未找到'返回'文字，尝试更多策略...");
    screenshot.recycle();
    this._clickReturnFallback();
};

/**
 * 结算页"返回"按钮的降级点击策略
 * 策略优先级: complete_turn_icon → back_button → 坐标(左下角)
 */
TaskManager.prototype._clickReturnFallback = function () {
    // 策略2: 模板匹配结算页返回按钮
    if (this.clickTemplate("complete_turn_icon")) {
        log("  [结算] ✓ complete_turn_icon 模板匹配成功");
        sleep(2000);
        return;
    }

    // 策略3: 通用返回按钮模板
    if (this.clickTemplate("back_button")) {
        log("  [结算] ✓ back_button 模板匹配成功");
        sleep(2000);
        return;
    }

    // 策略4: 坐标兜底 — 结算页"返回"通常在底部左侧区域
    var sw = device.width || 720;
    var sh = device.height || 1280;
    var fallbackX = Math.floor(sw * 0.15);   // 左侧15%
    var fallbackY = Math.floor(sh * 0.85);   // 底部15%
    log("  [结算] 所有策略均失败，使用坐标兜底: (" + fallbackX + ", " + fallbackY + ")");
    click(fallbackX, fallbackY);
    sleep(2000);
};

module.exports = { TaskManager: TaskManager };
