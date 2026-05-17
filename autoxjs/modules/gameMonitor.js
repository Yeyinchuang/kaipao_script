/**
 * 游戏窗口监控模块
 * 1. 独立线程监控游戏是否在前台，被切出去自动切回来
 * 2. 启动时通过小程序AppID自动打开游戏
 */

function GameMonitor() {
    this.isRunning = false;
    this.monitorThread = null;
    this.packageName = "com.tencent.mm"; // 微信包名
    this.miniProgramAppId = "wx31a9c726536cdacc"; // 向僵尸开炮小程序ID
    this.checkInterval = 5000; // 检查间隔 5秒
}

/**
 * 诊断当前小程序信息
 * 用法：手动打开小程序后，在AutoXJS控制台调用 gameMonitor.diagnoseMiniProgram()
 * 会输出当前Activity和Intent参数，帮助确定正确的启动命令
 */
GameMonitor.prototype.diagnoseMiniProgram = function() {
    log("========== 小程序诊断开始 ==========");
    
    // 1. 当前前台Activity
    try {
        var topResult = shell("dumpsys activity top | grep ACTIVITY", true);
        log("[诊断] 当前Top Activity:\n" + (topResult ? topResult.result : "null"));
    } catch(e) {
        log("[诊断] 获取top activity失败: " + e.message);
    }

    // 2. 最近运行的Activity（包含Intent extras）
    try {
        var recentResult = shell("dumpsys activity recents | grep -A 5 'com.tencent.mm'", true);
        log("[诊断] 最近微信Activity:\n" + (recentResult ? recentResult.result : "null"));
    } catch(e) {
        log("[诊断] 获取recents失败: " + e.message);
    }

    // 3. 尝试获取Intent详情
    try {
        var intentResult = shell("dumpsys activity top | grep -A 20 'ACTIVITY.*com.tencent.mm'", true);
        log("[诊断] Activity详情:\n" + (intentResult ? intentResult.result : "null"));
    } catch(e) {
        log("[诊断] 获取intent详情失败: " + e.message);
    }

    // 4. 当前包名
    log("[诊断] 当前包名: " + currentPackage());

    // 5. 微信版本
    try {
        var versionResult = shell("dumpsys package com.tencent.mm | grep versionName", true);
        log("[诊断] 微信版本:\n" + (versionResult ? versionResult.result : "null"));
    } catch(e) {}

    log("========== 小程序诊断结束 ==========");
    log("请把以上日志发给我，我来确定正确的启动命令");
};

/**
 * 启动监控线程
 */
GameMonitor.prototype.start = function() {
    if (this.isRunning) return;
    this.isRunning = true;

    var self = this;
    this.monitorThread = threads.start(function() {
        while (self.isRunning) {
            try {
                self._checkAndRestore();
            } catch (e) {
                log("[GameMonitor] 检查出错: " + e.message);
            }
            sleep(self.checkInterval);
        }
    });

    log("[GameMonitor] 窗口监控已启动，每" + (this.checkInterval/1000) + "秒检查一次");
};

/**
 * 停止监控
 */
GameMonitor.prototype.stop = function() {
    this.isRunning = false;
    if (this.monitorThread) {
        this.monitorThread.interrupt();
        this.monitorThread = null;
    }
    log("[GameMonitor] 窗口监控已停止");
};

/**
 * 检查当前前台应用，如果不是微信则切回来
 */
GameMonitor.prototype._checkAndRestore = function() {
    var currentPkg = currentPackage();

    if (currentPkg && currentPkg !== this.packageName) {
        log("[GameMonitor] 检测到游戏被切出 (当前:" + currentPkg + ")，正在切回微信...");
        this._switchBackToWechat();
    }
};

/**
 * 切回微信并唤起小程序
 */
GameMonitor.prototype._switchBackToWechat = function() {
    try {
        // 先切回微信
        app.launch(this.packageName);
        sleep(1500);

        // 再用 URL Scheme 唤起小程序
        this._launchByBusinessScheme();
        sleep(3000);

        toast("⚠ 游戏被切出，已自动切回");
    } catch (e) {
        log("[GameMonitor] 切回微信失败: " + e.message);
    }
};

/**
 * 判断小程序是否在前台运行
 * 必须是当前 top activity 才算在前台
 */
GameMonitor.prototype._isMiniProgramRunning = function() {
    try {
        var result = shell("dumpsys activity top | grep ACTIVITY", true);
        if (result && result.result) {
            var lines = result.result.split("\n");
            // 只检查第一行（当前 top activity）
            if (lines.length > 0) {
                var topLine = lines[0];
                if (topLine.indexOf("com.tencent.mm") >= 0 
                    && (topLine.indexOf("AppBrand") >= 0 
                    || topLine.indexOf("LaunchAppUI") >= 0
                    || topLine.indexOf("game") >= 0)) {
                    return true;
                }
            }
        }
    } catch (e) {}
    return false;
};

/**
 * 启动游戏
 * 每次都强制唤起小程序，不依赖进程检测
 */
GameMonitor.prototype.launchGame = function() {
    log("[GameMonitor] 正在启动向僵尸开炮...");

    // 先启动微信
    app.launch(this.packageName);
    sleep(3000);

    // 强制唤起小程序（不管是否已在运行）
    var methods = [
        { name: "weixin://dl/business", fn: this._launchByBusinessScheme.bind(this) },
        { name: "am start AppBrandUI", fn: this._launchByAmStart.bind(this) },
        { name: "Intent URL Scheme", fn: this._launchByIntent.bind(this) },
        { name: "UI点击", fn: this._launchMiniProgramByUI.bind(this) }
    ];

    for (var i = 0; i < methods.length; i++) {
        log("[GameMonitor] 尝试方案" + (i + 1) + ": " + methods[i].name);
        try {
            methods[i].fn();
            sleep(5000);
            
            // 检测当前是否是微信（小程序运行在微信内）
            var currentPkg = currentPackage();
            if (currentPkg === this.packageName) {
                log("[GameMonitor] ✓ 小程序启动成功！");
                sleep(3000);
                return;
            } else {
                log("[GameMonitor] ✗ 方案" + (i + 1) + "未成功启动小程序 (当前包:" + currentPkg + ")");
            }
        } catch (e) {
            log("[GameMonitor] 方案" + (i + 1) + "异常: " + e.message);
        }
    }

    log("[GameMonitor] 所有方案均失败，请手动打开小程序");
    toast("请手动打开「向僵尸开炮」小程序");
};

/**
 * 方案1: weixin://dl/business/?appid= 
 * 这是微信开放标签用的URL Scheme，可能可以直接唤起小程序
 */
GameMonitor.prototype._launchByBusinessScheme = function() {
    try {
        // 方法A: business scheme
        var url = "weixin://dl/business/?appid=" + this.miniProgramAppId;
        var Intent = android.content.Intent;
        var intent = new Intent();
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(android.net.Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
        log("[GameMonitor] weixin://dl/business 已发送");
    } catch (e) {
        log("[GameMonitor] business scheme失败: " + e.message);
    }

    // 方法B: 通过 shell
    try {
        var cmd = "am start -a android.intent.action.VIEW "
                  + "-d 'weixin://dl/business/?appid=" + this.miniProgramAppId + "'";
        var result = shell(cmd, true);
        log("[GameMonitor] shell business scheme: " + (result ? result.code + " " + result.result : "null"));
    } catch (e2) {}
};

/**
 * 方案2: 通过 am start 启动小程序
 */
GameMonitor.prototype._launchByAmStart = function() {
    try {
        var cmd = "am start -n com.tencent.mm/.plugin.appbrand.ui.AppBrandUI"
                  + " --es appId '" + this.miniProgramAppId + "'"
                  + " --ei appBrandId 2"
                  + " --ei enterType 1";
        var result = shell(cmd, true);
        log("[GameMonitor] am start AppBrandUI: " + (result ? result.code + " " + result.result : "null"));
    } catch (e) {
        log("[GameMonitor] am start 失败: " + e.message);
    }
};

/**
 * 方案3: 通过 Android Intent URL Scheme
 */
GameMonitor.prototype._launchByIntent = function() {
    try {
        var Intent = android.content.Intent;
        var intent = new Intent();
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(android.net.Uri.parse("weixin://dl/mini_program?appid=" + this.miniProgramAppId));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
        log("[GameMonitor] Intent方式已发送");
    } catch (e) {
        log("[GameMonitor] Intent方式失败: " + e.message);
    }
};

/**
 * 方案4: 通过UI点击小程序
 */
GameMonitor.prototype._launchMiniProgramByUI = function() {
    try {
        var width = device.width;
        var height = device.height;

        // 确保在微信首页
        back();
        sleep(500);
        back();
        sleep(500);

        // 下拉首页
        swipe(width / 2, height * 0.1, width / 2, height * 0.6, 500);
        sleep(1000);

        // 查找小程序入口
        var target = textContains("向僵尸开炮").findOne(3000);
        if (!target) {
            target = descContains("向僵尸开炮").findOne(2000);
        }

        if (target) {
            click(target.bounds().centerX(), target.bounds().centerY());
            log("[GameMonitor] 已点击小程序入口");
            sleep(3000);
        } else {
            log("[GameMonitor] UI方案也未找到小程序入口");
        }
    } catch (e) {
        log("[GameMonitor] UI启动失败: " + e.message);
    }
};

/**
 * 设置监控检查间隔
 */
GameMonitor.prototype.setCheckInterval = function(ms) {
    this.checkInterval = ms;
    log("[GameMonitor] 检查间隔已设置为 " + (ms/1000) + " 秒");
};

module.exports = { GameMonitor: GameMonitor };
