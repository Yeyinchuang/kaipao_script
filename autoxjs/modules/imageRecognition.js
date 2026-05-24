/**
 * 图像识别模块
 * 基于 AutoX.js images 模块实现模板匹配和 OCR
 */

// ==================== 场景识别规则配置表 ====================
var SCENE_RULES = [
    // ===== 最高优先：重连提示（网络超时等）=====
    {
        scene: "RECONNECT",
        priority: -2,
        templates: ["scene/scene_reconnect"]
    },

    // ===== 最高优先：结算和退出 =====
    {
        scene: "BATTLE_COMPLETE_TURN",
        priority: -1,
        templates: ["scene/battle/scene_huanqiu_return", "scene/battle/scene_jingying_return"]
    },
    {
        scene: "BATTLE_QUIT",
        priority: -1,
        templates: ["scene/battle/scene_quit"]
    },

    // ===== 战斗中 =====
    {
        scene: "IN_BATTLE",
        priority: 0,
        threshold: 0.75, // 降低阈值，战斗中图标变化大
        templates: [
            "scene/battle/scene_in_battle",
            "scene/battle/scene_in_battle_bak"
        ]
    },

    // ===== 组队/招募频道 =====
    {
        scene: "TEAM_HALL",
        priority: 0,
        templates: ["scene/bubble_chat/scene_team_hall"]
    },
    {
        scene: "RECRUIT_CHANNEL",
        priority: 0,
        templates: ["scene/bubble_chat/scene_recruit_tab"]
    },

    // ===== 寰球救援房间 =====
    {
        scene: "WAITING_START",
        priority: 1,
        templates: ["scene/huanqiu_room/scene_waiting_start"]
    },
    {
        scene: "HUANQIU_ROOM",
        priority: 2,
        templates: ["scene/huanqiu_room/scene_huanqiu_room"]
    },

    // ===== 训练大厅 =====
    {
        scene: "TRAINING_HALL",
        priority: 5,
        templates: ["scene/training_hall/scene_training_hall"]
    },

    // ===== 主菜单各tab =====
    { scene: "MAIN_MENU_BASE",   priority: 6, templates: ["scene/main_menu/scene_main_menu_base"] },
    { scene: "MAIN_MENU_ARMY",   priority: 6, templates: ["scene/main_menu/scene_main_menu_army"] },
    { scene: "MAIN_MENU_CORE",   priority: 6, templates: ["scene/main_menu/scene_main_menu_core"] },
    { scene: "MAIN_MENU_ROLE",   priority: 6, templates: ["scene/main_menu/scene_main_menu_role"] },
    { scene: "MAIN_MENU_SHOP",   priority: 6, templates: ["scene/main_menu/scene_main_menu_shop"] },
    { scene: "MAIN_MENU_JOURNEY",priority: 6, templates: ["scene/main_menu/scene_main_menu_journey"] },
    { scene: "MAIN_MENU_BATTLE", priority: 6, templates: ["scene/main_menu/scene_main_menu_battle"] },
];

function ImageRecognition(config) {
    this.config = config || {};
    this.templateThreshold = this.config.templateThreshold || 0.8;
    this.ocrEnabled = this.config.ocrEnabled !== false;
    this.sceneCacheTime = this.config.sceneCacheTime || 2000;
    this.lastScene = "UNKNOWN";
    this.lastSceneTime = 0;
    this.templateCache = {};
    this._ocrBlocks = null;
    this._ocrFullText = "";
    this._ocrScreenTime = 0;
    this.lastOcrTime = 0;
    // MuMu 共享文件夹，截图直接保存到这里，电脑可直接查看
    this.DEBUG_DIR = "/sdcard/Documents/ MuMu共享文件夹/autoxjs_debug/";
}

ImageRecognition.prototype.captureScreen = function () {
    var maxRetry = 3;
    for (var i = 0; i < maxRetry; i++) {
        try {
            var result = images.captureScreen();
            if (result) return result;
            log("截图返回空，重试 (" + (i + 1) + "/" + maxRetry + ")");
        } catch (e) {
            log("截图失败 (" + (i + 1) + "/" + maxRetry + "): " + e.message);
        }
        if (i < maxRetry - 1) sleep(1000);
    }
    log("截图最终失败，已重试" + maxRetry + "次");
    return null;
};

ImageRecognition.prototype.matchTemplate = function (screenshot, templateName, threshold, region) {
    threshold = threshold || this.templateThreshold;
    var template = this.loadTemplate(templateName);
    if (!template) {
        return { found: false, x: 0, y: 0, confidence: 0 };
    }

    try {
        var options = { threshold: threshold };
        if (region) {
            options.region = [region.x, region.y, region.width, region.height];
        }

        var result = images.matchTemplate(screenshot, template, options);
        if (result.matches && result.matches.length > 0) {
            var best = result.matches[0];
            return {
                found: best.similarity >= threshold,
                x: best.point.x,
                y: best.point.y,
                confidence: best.similarity
            };
        }
    } catch (e) {
        log("模板匹配出错: " + e.message);
    }

    return { found: false, x: 0, y: 0, confidence: 0 };
};

ImageRecognition.prototype.loadTemplate = function (templateName) {
    if (this.templateCache[templateName]) {
        return this.templateCache[templateName];
    }

    try {
        var fullPath = "./templates/" + templateName + ".png";
        var template = images.read(fullPath);
        if (template) {
            this.templateCache[templateName] = template;
        } else {
            log("模板加载失败: " + fullPath);
        }
        return template;
    } catch (e) {
        log("加载模板出错 (" + templateName + "): " + e.message);
        return null;
    }
};

ImageRecognition.prototype.clearTemplateCache = function () {
    for (var key in this.templateCache) {
        try {
            this.templateCache[key].recycle();
        } catch (e) {}
    }
    this.templateCache = {};
};

ImageRecognition.prototype.detectScene = function (screenshot) {
    var currentTime = Date.now();
    if (currentTime - this.lastSceneTime < this.sceneCacheTime) {
        return this.lastScene;
    }

    try {
        var sortedRules = SCENE_RULES.slice().sort(function (a, b) {
            return (a.priority || 99) - (b.priority || 99);
        });

        // 收集所有模板的匹配分数，用于 UNKNOWN 时排查
        var allScores = [];

        for (var ri = 0; ri < sortedRules.length; ri++) {
            var rule = sortedRules[ri];
            if (!rule.templates || rule.templates.length === 0) continue;
            var ruleThreshold = rule.threshold || this.templateThreshold;
            for (var ti = 0; ti < rule.templates.length; ti++) {
                var matchResult = this.matchTemplate(screenshot, rule.templates[ti], ruleThreshold);
                allScores.push({ scene: rule.scene, template: rule.templates[ti], confidence: matchResult.confidence });
                if (matchResult.found) {
                    log("[模板] ✓ " + rule.scene + " (" + rule.templates[ti] + ") score=" + matchResult.confidence.toFixed(3));
                    return this._setScene(rule.scene, currentTime);
                }
            }
        }

        // UNKNOWN 时按分数排序输出前5，方便查看哪个模板接近
        allScores.sort(function (a, b) { return b.confidence - a.confidence; });
        var topN = allScores.slice(0, 5);
        var scoreLog = "[场景] UNKNOWN! Top5: ";
        for (var si = 0; si < topN.length; si++) {
            scoreLog += topN[si].scene + "(" + topN[si].template.split("/").pop() + ")=" + topN[si].confidence.toFixed(3) + " ";
        }
        log(scoreLog);
    } catch (e) {
        log("场景检测出错: " + e.message);
    }

    return this._setScene("UNKNOWN", currentTime);
};

ImageRecognition.prototype._setScene = function (scene, time) {
    this.lastScene = scene;
    this.lastSceneTime = time;
    log("场景检测结果: " + scene);
    return scene;
};

// ==================== 调试截图保存 ====================

ImageRecognition.prototype.saveDebugShot = function (screenshot, label) {
    if (!screenshot) return null;

    try {
        var dir = this.DEBUG_DIR;
        if (!files.exists(dir)) {
            files.createWithDirs(dir);
        }

        var now = new Date();
        var timeStr = "" +
            String(now.getHours()).padStart(2, "0") +
            String(now.getMinutes()).padStart(2, "0") +
            String(now.getSeconds()).padStart(2, "0") +
            String(now.getMilliseconds()).padStart(3, "0");

        var safeLabel = (label || "shot").replace(/[^a-zA-Z0-9_\-]/g, "_");
        var filename = timeStr + "_" + safeLabel + ".png";
        var filepath = dir + filename;

        images.save(screenshot, filepath);

        var shortPath = "debug_shots/" + filename;
        log("[DEBUG_SHOT] → " + shortPath + " (" + label + ")");
        return shortPath;
    } catch (e) {
        log("[DEBUG_SHOT] 保存失败: " + e.message);
        return null;
    }
};

ImageRecognition.prototype.cleanDebugShots = function (keepRecent) {
    keepRecent = keepRecent || 50;
    try {
        var dir = this.DEBUG_DIR;
        if (!files.exists(dir)) return;

        var allFiles = files.listDir(dir, function(f) {
            return f.isFile() && f.getName().endsWith(".png");
        });
        if (!allFiles || allFiles.length <= keepRecent) return;

        allFiles.sort(function(a, b) {
            return a.lastModified() - b.lastModified();
        });

        for (var i = 0; i < allFiles.length - keepRecent; i++) {
            files.remove(allFiles[i].getPath());
        }
        log("[DEBUG_SHOT] 清理完成，保留最近 " + keepRecent + " 张");
    } catch (e) {}
};

module.exports = { ImageRecognition: ImageRecognition };
