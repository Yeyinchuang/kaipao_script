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
        // 主菜单各tab（独立场景）
        "MAIN_MENU_BASE": "主菜单-基地",
        "MAIN_MENU_ARMY": "主菜单-军团",
        "MAIN_MENU_CORE": "主菜单-核心",
        "MAIN_MENU_ROLE": "主菜单-角色",
        "MAIN_MENU_SHOP": "主菜单-商城",
        "MAIN_MENU_JOURNEY": "主菜单-征途",
        "MAIN_MENU_BATTLE": "主菜单-战斗",
        // 其他
        "TRAINING_HALL": "历练大厅",
        "HUANQIU_ROOM": "寰球房间",
        "WAITING_START": "等待开始",
        "TEAM_HALL": "组队频道",
        "RECRUIT_CHANNEL": "招募频道",
        "IN_BATTLE": "战斗中",
        "BATTLE_COMPLETE_TURN": "结算完成",
        "BATTLE_QUIT": "退出结算"
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
            log("  [状态机] INIT -> " + sceneType + " (跟随实际场景)");
            this._switchState(sceneType, currentTime);
            break;

        // ==================== MAIN_MENU_* (各导航栏tab独立场景) ====================
        // 已在基地tab → 直接点历练大厅；在其他tab → 先切到基地
        case "MAIN_MENU_BASE":
        case "MAIN_MENU_ARMY":
        case "MAIN_MENU_CORE":
        case "MAIN_MENU_ROLE":
        case "MAIN_MENU_SHOP":
        case "MAIN_MENU_JOURNEY":
        case "MAIN_MENU_BATTLE":
            if (this._tryFollowScene(sceneType, currentTime, ["BATTLE_COMPLETE_TURN", "TRAINING_HALL"])) return;

            // 判断当前是否在基地tab（只有基地tab才直接点历练大厅）
            var isOnBaseTab = (this.currentState === "MAIN_MENU_BASE" && sceneType === "MAIN_MENU_BASE");

            if (isOnBaseTab) {
                // 已在基地 → 点历练大厅进入训练大厅
                if (this._shouldRetryAction(currentTime, 5000)) {
                    toast("✓ 在基地，点历练大厅");
                    this.mainMenuActions();
                }
            } else if (sceneType.indexOf("MAIN_MENU") >= 0) {
                // 在其他tab → 点击基地tab切换过去
                if (this._shouldRetryAction(currentTime, 3000)) {
                    log("  [状态机] 当前在 " + this.currentState + "，点击基地tab");
                    this.clickTemplate("click/main_menu/click_main_menu_base");
                }
            }

            if (currentTime - this.lastStateChangeTime > 15000) {
                log("  [状态机] 主菜单超时15s，重试");
                this._handleTimeoutAndReset(currentTime, "MAIN_MENU_BASE");
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

        // ==================== HUANQIU_ROOM (寰球救援房间) ====================
        case "HUANQIU_ROOM":
            if (this._tryFollowScene(sceneType, currentTime, ["TEAM_HALL", "WAITING_START", "IN_BATTLE", "BATTLE_COMPLETE_TURN"])) return;
            if (sceneType === "HUANQIU_ROOM") {
                if (this._shouldRetryAction(currentTime, 5000)) {
                    toast("✓ 寰球房间，点击冒泡");
                    this.gameRoomActions(screenshot);
                }
            } else if (currentTime - this.lastStateChangeTime > 25000) {
                log("  [状态机] HUANQIU_ROOM 超时25s，处理超时");
                this._handleTimeoutAndReset(currentTime, "MAIN_MENU");
            }
            break;

        // ==================== WAITING_START (等待开始) ====================
        case "WAITING_START":
            // 已抢到房间，等待房主开始游戏，5秒后重新识别场景
            if (sceneType === "WAITING_START") {
                log("  [等待开始] 已在房间等待中，5秒后重新识别");
                sleep(5000);
            } else {
                // 场景变了（进入战斗/结算等），跟随切换
                this._tryFollowScene(sceneType, currentTime);
            }
            break;

        // ==================== TEAM_HALL (组队频道) ====================
        case "TEAM_HALL":
            if (this._tryFollowScene(sceneType, currentTime)) return;
            if (sceneType === "TEAM_HALL") {
                if (this._shouldRetryAction(currentTime, 5000)) {
                    this.teamHallActions(screenshot);
                }
            } else if (currentTime - this.lastStateChangeTime > 30000) {
                log("  [状态机] TEAM_HALL 超时30s，处理超时");
                this._handleTimeoutAndReset(currentTime, "MAIN_MENU");
            }
            break;

        // ==================== RECRUIT_CHANNEL (招募频道) ====================
        case "RECRUIT_CHANNEL":
            if (this._tryFollowScene(sceneType, currentTime, ["TEAM_HALL"])) return;
            if (sceneType === "RECRUIT_CHANNEL") {
                if (this._shouldRetryAction(currentTime, 3000)) {
                    this.recruitChannelActions(screenshot);
                }
            } else if (currentTime - this.lastStateChangeTime > 60000) {
                log("  [状态机] RECRUIT_CHANNEL 超时60s，处理超时");
                this._handleTimeoutAndReset(currentTime, "MAIN_MENU");
            }
            break;

        // ==================== IN_BATTLE (战斗中) ====================
        case "IN_BATTLE":
            // 首次进入IN_BATTLE状态，记录开始时间
            if (this.battleStartTime === 0) {
                this.battleStartTime = Date.now();
                log("  [状态机] 战斗计时开始: " + new Date().toLocaleTimeString());
            }

            if (sceneType === "IN_BATTLE") {
                // ===== 正常战斗中（寰球救援/精英战斗统一处理）=====
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
                var battleText = this.imageRecognition.recognizeText(screenshot);
                log("  [状态机] 正常战斗中，执行 battleActions");
                this.battleActions(screenshot, battleText);

            } else if (sceneType === "BATTLE_COMPLETE_TURN") {
                // 战斗结束出结算 → 切到BATTLE_COMPLETE_TURN状态
                log("  [状态机] IN_BATTLE中检测到结算页 -> 切到 BATTLE_COMPLETE_TURN");
                toast("⚡ 战斗结束，进入结算处理");
                this.battleStartTime = 0;
                this._switchState("BATTLE_COMPLETE_TURN", currentTime);
            } else if (currentTime - this.lastStateChangeTime > 60000) {
                log("  [状态机] IN_BATTLE 超时60s，处理战斗超时");
                this.handleBattleTimeout();
            } else {
                // 场景变了（弹窗等短暂遮挡），跟随切换
                log("  [状态机] IN_BATTLE状态但场景为 " + sceneType + "，跟随切换");
                this._switchState(sceneType, currentTime);
            }
            break;

        // ==================== BATTLE_COMPLETE_TURN (结算完成) ====================
        case "BATTLE_COMPLETE_TURN":
            if (sceneType === "BATTLE_COMPLETE_TURN") {
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

        // ==================== UNKNOWN ====================
        // 未知状态：直接跟随场景切换到对应状态
        case "UNKNOWN":
            if (sceneType === "UNKNOWN") {
                // 连续未知，保持等待（unknownCount 在上层已处理）
                break;
            }
            log("  [状态机] UNKNOWN -> " + sceneType + " (跟随场景)");
            this._switchState(sceneType, currentTime);
            break;

        // ==================== default ====================
        // 其他未知状态：尝试关闭弹窗，然后跟随场景
        default:
            if (sceneType && sceneType !== this.currentState) {
                // 先尝试关闭可能的弹窗（X按钮）
                if (this.clickTemplate("common/close_tag") || this.clickTemplate("click/click_close")) {
                    log("  [状态机] 默认: 关闭弹窗后保持当前状态");
                    break;
                }
                log("  [状态机] 默认: " + this.currentState + " -> " + sceneType);
                this._switchState(sceneType, currentTime);
            }
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
    var globalInterceptScenes = ["BATTLE_COMPLETE_TURN", "BATTLE_QUIT"];
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
 * 纯模板点击（原OCR文字点击已废弃）
 * 直接用 fallbackTemplate 模板匹配并点击
 */
TaskManager.prototype.clickByText = function (targetText, fallbackTemplate, region) {
    log("  [操作] 点击(纯模板): '" + targetText + "' → 模板: " + fallbackTemplate + "");
    if (!fallbackTemplate) {
        log("  [操作] ✗ 无降级模板，跳过");
        return false;
    }
    return this.clickTemplate(fallbackTemplate);
};

/**
 * 模板点击 - 可传入截图对象复用（不重新截图）
 */
TaskManager.prototype.clickTemplate = function (templateName, existingScreenshot) {
    var screenshot = existingScreenshot || this.imageRecognition.captureScreen();
    if (!screenshot) {
        log("  [操作] ✗ 截图失败，无法匹配模板: " + templateName);
        return false;
    }

    var result = this.imageRecognition.matchTemplate(screenshot, templateName, this.imageRecognition.templateThreshold);
    if (result.found) {
        log("  [操作] ✓ 模板匹配成功: " + templateName + " (" + result.x + ", " + result.y + ")");
        this.smartClick(result.x, result.y);
        if (!existingScreenshot) screenshot.recycle();
        return true;
    }

    log("  [操作] ✗ 模板未匹配: " + templateName);
    if (!existingScreenshot) screenshot.recycle();
    return false;
};

/**
 * 主菜单操作 - 点击基地图标（多重策略）
 * 策略优先级: 1.当前截图OCR找"基地"  2.模板匹配base_icon  3.导航栏坐标估算
 */
TaskManager.prototype.mainMenuActions = function () {
    log(">>> 执行 mainMenuActions: 点历练大厅");
    toast("操作: 点历练大厅");

    // 直接用模板点击历练大厅按钮
    if (this.clickTemplate("click/menu_base/click_training_hall")) {
        log("  [主菜单] ✓ 点击历练大厅模板成功");
        sleep(2000);
        return;
    }

    // 兜底：OCR查找"历练大厅"
    var screenshot = this.imageRecognition.captureScreen();
    if (!screenshot) return;
    if (this.clickByText("历练大厅", "click/menu_base/click_training_hall")) {
        log("  [主菜单] ✓ OCR找到'历练大厅'");
        sleep(2000);
    } else {
        toast("未找到历练大厅按钮");
    }
};

/**
 * 基地菜单操作 - 进入历练大厅（支持滑动查找）
 * 策略: 全屏OCR找文字 → 没找到则滑动 → 再找 → 降级模板
 */
TaskManager.prototype.baseMenuActions = function (screenshot) {
    log(">>> 执行 baseMenuActions: 进入历练大厅");
    toast("操作: 进入历练大厅");

    // 策略1: 直接全屏OCR查找"历练大厅"（不限区域）
    if (this.clickByText("历练大厅", "click/menu_base/click_training_hall")) {
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

        // 滑动后再找
        if (this.clickByText("历练大厅", "click/menu_base/click_training_hall")) {
            log("<<< baseMenuActions 完成 (直接点击)");
            sleep(2000);
            return;
        }
        newScreenshot.recycle();
    }
    sleep(2000);
};

/**
 * 历练大厅操作 - 模板优先：找寰球救援标题 → 在其下方点挑战按钮
 * 速度：纯模板匹配 <50ms（vs OCR 方案 5-10秒）
 *
 * 流程：
 *   1. 模板匹配 "寰球救援" 标题 → 获得坐标
 *   2. 在标题下方区域匹配 "挑战" 按钮模板 → 点击
 *   3. 标题没找到 → 降级 OCR
 *
 * 需要的模板（放在 scene/training_hall/ 目录下）：
 *   - huanqiu_title.png : "寰球救援?" 标题区域截图
 *   - challenge_btn.png  : 橙色"挑战"按钮截图
 */
TaskManager.prototype.trainingHallActions = function (screenshot) {
    log(">>> 执行 trainingHallActions: 查找寰球救援(模板优先)");
    toast("操作: 查找寰球救援");

    var sw = screenshot.getWidth();
    var sh = screenshot.getHeight();

    // ========== 步骤1: 模板匹配"寰球救援"标题区域 ==========
    var titleResult = this.imageRecognition.matchTemplate(screenshot, "click/training_hall/click_huanqiu_title", 0.7);

    if (titleResult.found) {
        log("  [历练大厅] ✓ 找到'寰球救援'标题: (" + titleResult.x + ", " + titleResult.y + ")");

        // ========== 步骤2: 在标题下方匹配"挑战"按钮 ==========
        // 裁剪搜索区域（标题y+40 到 y+260），局部匹配更快
        var searchTop = titleResult.y + 40;
        var searchBottom = Math.min(titleResult.y + 260, sh);
        var searchImg = images.clip(screenshot, 0, searchTop, sw, searchBottom - searchTop);
        var btnResult = this.imageRecognition.matchTemplate(searchImg, "click/training_hall/click_challenge_btn", 0.75);

        if (btnResult.found) {
            var clickX = btnResult.x;
            var clickY = searchTop + btnResult.y; // 还原为全屏坐标
            log("  [历练大厅] ✓ 找到'挑战'按钮: (" + clickX + ", " + clickY + ")");
            this.smartClick(clickX, clickY);
            searchImg.recycle();
            sleep(2000);
            log("<<< trainingHallActions 完成（模板成功）");
            return;
        }

        searchImg.recycle();
        log("  [历练大厅] 标题找到但挑战按钮未命中，坐标兜底点击");
        // 兜底：挑战按钮在卡片右中部
        this.smartClick(sw * 0.65, titleResult.y + 180);
        sleep(2000);
        log("<<< trainingHallActions 完成（坐标兜底）");
        return;
    }
    log("<<< trainingHallActions 完成");
};

/**
 * 游戏房间操作 - 在房间内处理
 * 流程: 点击hp100冒泡图标进入队伍 → 尝试点击"开始游戏" → 无目标则退出回招募
 */
TaskManager.prototype.gameRoomActions = function (screenshot) {
    log(">>> 执行 gameRoomActions: 点击冒泡进入组队");
    toast("操作: 点击冒泡进入");

    // 步骤1: 点击聊天冒泡图标（click_chat_bubble 模板）
    var bubbleResult = this.imageRecognition.matchTemplate(screenshot, "click/huanqiu_room/click_chat_bubble", 0.7);
    if (bubbleResult.found) {
        log("  [游戏房间] ✓ 找到冒泡图标: (" + bubbleResult.x + ", " + bubbleResult.y + ")，点击");
        click(bubbleResult.x + 5, bubbleResult.y + 5);
        sleep(2000);
        log("<<< gameRoomActions 完成");
        return;
    }

    // 步骤2: 模板没找到，用 findAllTemplates 兜底
    var hpResults = this.imageRecognition.findAllTemplates(screenshot, "click/huanqiu_room/click_chat_bubble");
    if (hpResults.length > 0) {
        log("  [游戏房间] ✓ 找到 " + hpResults.length + " 个 hp100 冒泡，点击");
        this.clickAllPositions(hpResults);
        sleep(2000);
        log("<<< gameRoomActions 完成");
        return;
    }

    // 步骤3: 都没找到，点击屏幕右侧常见冒泡位置
    click(Math.floor(screenshot.getWidth() * 0.88), Math.floor(screenshot.getHeight() * 0.55));
    log("  [游戏房间] 兜底：点击右侧冒泡区域");
    sleep(2000);
    log("<<< gameRoomActions 完成");
};

/**
 * 组队流程
 */
TaskManager.prototype.enterTeamFlow = function () {
    log("执行组队大厅操作流程");

    var screenshot = this.imageRecognition.captureScreen();
    if (!screenshot) return false;

    var teamHallResult = this.imageRecognition.matchTemplate(screenshot, "scene/huanqiu_room/scene_huanqiu_room1", 0.8); // 寰球救援入口
    if (teamHallResult.found) {
        log("检测到组队大厅图标，点击进入");
        this.smartClick(teamHallResult.x + 5, teamHallResult.y + 5);

        // 检测快速加入按钮
        for (var i = 0; i < 3 && this.isRunning; i++) {
            sleep(1000);
            var newScreenshot = this.imageRecognition.captureScreen();
            if (!newScreenshot) continue;

            var quickJoinResult = this.imageRecognition.matchTemplate(newScreenshot, "click/huanqiu_room/click_chat_bubble", 0.8);
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
 * 高频点击最下方房间加入（30秒持续狂点）
 * 中间每10秒识别一次场景，防止死循环
 * @param {Image} screenshot 当前截图
 */
TaskManager.prototype._spamClickJoinButtons = function (screenshot) {
    var sw = screenshot.getWidth();
    var sh = screenshot.getHeight();

    // 只点最下方的房间卡片居中("多人挑战"区域)
    var targetX = Math.floor(sw * 0.55);
    var targetY = Math.floor(sh * 0.700);

    var durationMs = 30000;
    var batchClicks = 20;
    var batchIntervalMs = 50;
    var endTime = Date.now() + durationMs;
    var startTime = Date.now();
    log("  [招募] 狂点最下方房间 (" + targetX + ", " + targetY + ")，持续" + (durationMs/1000) + "秒");

    while (Date.now() < endTime && this.isRunning) {
        for (var i = 0; i < batchClicks && Date.now() < endTime && this.isRunning; i++) {
            click(targetX + random(-5, 5), targetY + random(-5, 5));
            sleep(batchIntervalMs);
        }
        // 每10秒用模板快速检查是否已进入战斗/房间（避免死循环）
        if ((Date.now() - startTime) > 0 && (Date.now() - startTime) % 10000 < batchClicks * batchIntervalMs) {
            var quickCheck = this.imageRecognition.captureScreen();
            if (quickCheck) {
                // 模板检测：战斗暂停按钮 → 已在战斗中 → 停止
                if (this.imageRecognition.matchTemplate(quickCheck, "scene/battle/scene_in_battle", 0.75).found) {
                    log("  [招募] ✓ 模板检测到战斗暂停按钮，已进入战斗，停止抢房");
                    quickCheck.recycle();
                    break;
                }
                // 模板检测：游戏房间特征 → 已进入房间 → 停止
                if (this.imageRecognition.matchTemplate(quickCheck, "scene/huanqiu_room/scene_huanqiu_room1", 0.7).found
                    || this.imageRecognition.matchTemplate(quickCheck, "scene/huanqiu_room/scene_huanqiu_room", 0.7).found) {
                    log("  [招募] ✓ 模板检测到寰球房间特征，可能已进入房间，停止抢房");
                    quickCheck.recycle();
                    break;
                }
                quickCheck.recycle();
            }
        }
    }

    log("<<< _spamClickJoinButtons 完成");
};

/**
 * 组队频道操作 - 点击招募tab切换到招募频道
 * 组队频道包含：组队频道tab、世界频道tab
 * 需要切换到招募tab才能抢房
 */
TaskManager.prototype.teamHallActions = function (screenshot) {
    log(">>> 执行 teamHallActions: 点击招募tab");

    // 模板匹配优先找"招募"tab图标
    var recruitResult = this.imageRecognition.matchTemplate(screenshot, "click/bubble_chat/click_recruit_tab", 0.7);
    if (recruitResult.found) {
        log("  [组队频道] ✓ 模板匹配到'click_recruit_tab': (" + recruitResult.x + ", " + recruitResult.y + ")，点击切换");
        this.smartClick(recruitResult.x + 10, recruitResult.y + 15);
        sleep(1500);
        return;
    }

    log("  [组队频道] ✗ 未找到'招募'tab（模板）");
};

/**
 * 招募频道操作 - 疯狂点击抢房
 * 已确认在招募频道，直接高频点击加入按钮
 */
TaskManager.prototype.recruitChannelActions = function (screenshot) {
    log(">>> 执行 recruitChannelActions: 疯狂抢房");
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
    log(">>> 执行 _exitUnwantedBattle: 退出非目标战斗（纯模板）");
    toast("⚠ 非目标战斗，正在退出...");

    var sw = device.width || 720;
    var sh = device.height || 1280;
    var maxRetries = 6;

    for (var attempt = 0; attempt < maxRetries && this.isRunning; attempt++) {
        log("  [退出] 第 " + (attempt + 1) + "/" + maxRetries + " 次尝试");

        // 步骤1: 点击屏幕中央关闭弹窗
        for (var i = 0; i < 3; i++) {
            click(sw / 2 + random(-30, 30), sh * 0.55 + random(-20, 20));
            sleep(200);
        }

        // 步骤2: 点右上角暂停按钮
        click(sw - 25 + random(-8, 8), 45 + random(-8, 8));
        sleep(1500);

        // 步骤3: 截图，用模板匹配退出/关闭按钮
        var pauseScreen = this.imageRecognition.captureScreen();
        if (!pauseScreen) continue;

        if (this.clickTemplate("click/click_close", pauseScreen)) {
            log("  [退出] ✓ 模板匹配到关闭/退出按钮");
            toast("已退出非目标战斗");
            pauseScreen.recycle();
            sleep(2000);

            // 步骤4: 结果页返回（模板优先）
            var resultScreen = this.imageRecognition.captureScreen();
            if (resultScreen) {
                this.clickTemplate("scene/battle/scene_huanqiu_return", resultScreen)
                    || this.clickTemplate("scene/battle/scene_quit", resultScreen)
                    || click(sw * 0.15, sh * 0.85); // 坐标兜底
                resultScreen.recycle();
            }
            log("<<< _exitUnwantedBattle 成功退出");
            return;
        }

        log("  [退出] 未匹配到退出按钮，下次循环...");
        pauseScreen.recycle();
    }

    log("<<< _exitUnwantedBattle 循环结束，强制返回");
    this.backButtonClick();
};

/**
 * 战斗操作（纯模板匹配）
 * 技能选择：如果 detectScene 缓存了文字且含"X选择技能"则疯狂点击中间
 * 冒泡图标：模板匹配并点击
 * 开始游戏：模板匹配按钮并点击
 */
TaskManager.prototype.battleActions = function (screenshot, cachedText) {
    log(">>> 执行 battleActions: 战斗中（纯模板）");
    toast("操作: 战斗中");

    // ========== 技能选择检测（用缓存OCR文字，零额外开销）==========
    var battleText = cachedText || "";
    if (battleText && /[\d]+[\s]*选择技能/.test(battleText)) {
        log("  [战斗] ✓ 检测到'X 选择技能'界面，疯狂点击屏幕中间");
        var sw = screenshot.getWidth();
        var sh = screenshot.getHeight();
        var targetX = Math.floor(sw * 0.50);
        var targetY = Math.floor(sh * 0.58);
        var skillEndTime = Date.now() + 3000;
        while (Date.now() < skillEndTime && this.isRunning) {
            click(targetX + random(-8, 8), targetY + random(-8, 8));
            sleep(50);
        }
        return;
    }

    // 无技能选择 → 正常战斗中：点冒泡 / 点开始游戏
    // 模板匹配冒泡图标并点击
    var hp100Results = this.imageRecognition.findAllTemplates(screenshot, "click/huanqiu_room/click_chat_bubble");
    if (hp100Results.length > 0) {
        log("找到 " + hp100Results.length + " 个冒泡图标，点击");
        this.clickAllPositions(hp100Results);
    } else {
        // 没有冒泡 → 尝试模板匹配"开始游戏"按钮
        // ⚠ 需要在 scene/huanqiu_room/ 下放一个"开始游戏"按钮的模板
        this.clickTemplate("scene/huanqiu_room/scene_huanqiu_room1")
            || this.clickTemplate("click/huanqiu_room/click_chat_bubble"); // 兜底再试冒泡
    }
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
 * 点击返回按钮（纯模板匹配）
 * 优先：退出结算模板 → 返回按钮模板 → 坐标兜底（左上角）
 */
TaskManager.prototype.backButtonClick = function () {
    log("点击游戏内返回按钮（纯模板）");
    // 多个返回/关闭模板依次尝试
    if (this.clickTemplate("scene/battle/scene_quit")
        || this.clickTemplate("scene/battle/scene_huanqiu_return")
        || this.clickTemplate("click/click_close")) {
        sleep(1500);
        return;
    }
    // 模板都没命中，坐标兜底
    log("返回模板均未命中，坐标点击左上角");
    click(50, 50);
    sleep(1500);
};

/**
 * 处理超时
 */
TaskManager.prototype.handleTimeout = function () {
    log("  [超时] 处理超时 (当前: " + this.currentState + ")");
    this.backButtonClick();
    this._switchState("MAIN_MENU_BASE", Date.now());
};

/**
 * 处理战斗超时
 */
TaskManager.prototype.handleBattleTimeout = function () {
    log("战斗超时，尝试退出");
    this._exitUnwantedBattle(this.imageRecognition.captureScreen())
        || this.backButtonClick();
    this._switchState("TEAM_HALL", Date.now());
};

/**
 * 处理结算返回：模板优先点击返回按钮
 * 策略：结算页返回按钮 → 通用退出按钮 → 坐标兜底
 */
TaskManager.prototype.handleCompleteTurn = function () {
    log(">>> 处理结算返回（纯模板）");

    // 直接调用降级策略（已经是模板优先的）
    this._clickReturnFallback();
};

/**
 * 结算页"返回"按钮的降级点击策略
 * 策略优先级: scene_huanqiu_return → scene_quit → 坐标(左下角)
 */
TaskManager.prototype._clickReturnFallback = function () {
    // 策略2: 模板匹配结算页返回按钮（寰球救援结算）
    if (this.clickTemplate("scene/battle/scene_huanqiu_return")) {
        log("  [结算] ✓ scene_huanqiu_return 模板匹配成功");
        sleep(2000);
        return;
    }

    // 策略3: 通用退出按钮模板
    if (this.clickTemplate("scene/battle/scene_quit")) {
        log("  [结算] ✓ scene_quit 模板匹配成功");
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
