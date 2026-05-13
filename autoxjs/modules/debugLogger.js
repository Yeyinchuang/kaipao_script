/**
 * 调试日志模块
 * 同时输出到控制台和文件，方便排查问题
 * 日志文件保存在 MuMu 共享文件夹，电脑可直接查看
 */

function DebugLogger() {
    // 日志目录（与截图同目录，方便一起查看）
    this.logDir = "/sdcard/Documents/ MuMu共享文件夹/autoxjs_debug/";
    
    // 当前日志文件路径
    this.currentLogFile = null;
    
    // 启动时间
    this.startTime = new Date();
    
    // 初始化日志文件
    this._initLogFile();
}

/**
 * 初始化日志文件（按时间命名）
 */
DebugLogger.prototype._initLogFile = function() {
    try {
        // 确保目录存在
        if (!files.exists(this.logDir)) {
            files.createWithDirs(this.logDir);
        }
        
        // 文件名: debug_YYYYMMDD_HHMMSS.log
        var now = this.startTime;
        var dateStr = "" +
            now.getFullYear() +
            String(now.getMonth() + 1).padStart(2, "0") +
            String(now.getDate()).padStart(2, "0") +
            "_" +
            String(now.getHours()).padStart(2, "0") +
            String(now.getMinutes()).padStart(2, "0") +
            String(now.getSeconds()).padStart(2, "0");
        
        this.currentLogFile = this.logDir + "debug_" + dateStr + ".log";
        
        // 写入启动标记
        this._writeToFile("========================================");
        this._writeToFile("AutoXJS Debug Log Started");
        this._writeToFile("Time: " + now.toLocaleString());
        this._writeToFile("Log File: " + this.currentLogFile);
        this._writeToFile("========================================");
        
    } catch (e) {
        log("[DebugLogger] 初始化失败: " + e.message);
    }
};

/**
 * 内部方法：写入文件
 */
DebugLogger.prototype._writeToFile = function(message) {
    if (!this.currentLogFile) return;
    
    try {
        // 追加模式写入
        var mode = "a";
        var text = message + "\n";
        
        // AutoXJS 的 files.write 如果没有 append 模式，用 read+write 模拟
        var existing = "";
        if (files.exists(this.currentLogFile)) {
            existing = files.read(this.currentLogFile);
        }
        files.write(this.currentLogFile, existing + text);
        
    } catch (e) {
        // 文件写入失败不阻断程序
    }
};

/**
 * 格式化时间戳
 */
DebugLogger.prototype._formatTime = function() {
    var now = new Date();
    return "" +
        String(now.getHours()).padStart(2, "0") + ":" +
        String(now.getMinutes()).padStart(2, "0") + ":" +
        String(now.getSeconds()).padStart(2, "0") + "." +
        String(now.getMilliseconds()).padStart(3, "0");
};

/**
 * 记录日志（同时输出到控制台和文件）
 * @param {string} level 日志级别: INFO, WARN, ERROR, DEBUG
 * @param {string} message 日志内容
 */
DebugLogger.prototype.log = function(level, message) {
    level = level || "INFO";
    var timestamp = this._formatTime();
    var formatted = "[" + timestamp + "][" + level + "] " + message;
    
    // 输出到控制台
    log(formatted);
    
    // 写入文件
    this._writeToFile(formatted);
};

/**
 * 快捷方法：普通信息
 */
DebugLogger.prototype.info = function(message) {
    this.log("INFO", message);
};

/**
 * 快捷方法：警告
 */
DebugLogger.prototype.warn = function(message) {
    this.log("WARN", message);
};

/**
 * 快捷方法：错误
 */
DebugLogger.prototype.error = function(message) {
    this.log("ERROR", message);
};

/**
 * 快捷方法：调试信息
 */
DebugLogger.prototype.debug = function(message) {
    this.log("DEBUG", message);
};

/**
 * 记录调试截图信息
 * @param {string} filename 截图文件名
 * @param {string} label 截图标签
 */
DebugLogger.prototype.logScreenshot = function(filename, label) {
    this.log("SHOT", "Screenshot saved: " + filename + " (" + label + ")");
};

/**
 * 获取当前日志文件路径
 */
DebugLogger.prototype.getLogFilePath = function() {
    return this.currentLogFile;
};

module.exports = { DebugLogger: DebugLogger };
