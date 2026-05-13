/**
 * ============================================
 * AutoXJS 调试截图方法 — 集成到 imageRecognition.js
 * 将以下代码追加到 ImageRecognition.prototype 之后、module.exports 之前
 * ============================================
 */

// ==================== 调试截图保存 ====================

/**
 * 调试截图保存目录（MuMu 共享文件夹路径）
 * 这样截图可以直接在电脑上查看，无需 ADB 拉取
 */
ImageRecognition.DEBUG_DIR = "/sdcard/Documents/ MuMu共享文件夹/autoxjs_debug/";

/**
 * 保存调试截图到固定目录
 * @param {Image} screenshot 要保存的截图对象
 * @param {string} label 标签，如 "IN_BATTLE_UNKNOWN" "ERROR_recycled"
 * @returns {string|null} 保存的短路径，失败返回null
 *
 * 文件名格式: HHMMSSmmm_LABEL.png（毫秒级时间戳确保唯一）
 *
 * 使用示例：
 *   this.imageRecognition.saveDebugShot(screenshot, currentState + "_GOT_" + sceneType);
 *   // 输出: [DEBUG_SHOT] → debug_shots/1822450501_IN_BATTLE_GOT_TEAM_HALL.png
 */
ImageRecognition.prototype.saveDebugShot = function (screenshot, label) {
    if (!screenshot) return null;

    try {
        var dir = ImageRecognition.DEBUG_DIR;
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

/**
 * 清理过期调试截图（保留最近N张）
 * @param {number} keepRecent 保留数量，默认50
 */
ImageRecognition.prototype.cleanDebugShots = function (keepRecent) {
    keepRecent = keepRecent || 50;
    try {
        var dir = ImageRecognition.DEBUG_DIR;
        if (!files.exists(dir)) return;

        var allFiles = files.listDir(dir, function(f) {
            return f.isFile() && f.getName().endsWith(".png");
        });
        if (!allFiles || allFiles.length <= keepRecent) return;

        // 按修改时间排序，删除最旧的
        allFiles.sort(function(a, b) {
            return a.lastModified() - b.lastModified();
        });

        for (var i = 0; i < allFiles.length - keepRecent; i++) {
            files.remove(allFiles[i].getPath());
        }
        log("[DEBUG_SHOT] 清理完成，保留最近 " + keepRecent + " 张");
    } catch (e) {}
};
