/**
 * ============================================
 * taskManager.js 主循环集成 — 调试截图自动保存
 * 替换 detectScene() 调用之后、processStateMachine() 之前的代码
 * ============================================
 */

// ======== 原代码位置：主循环内，detectScene() 之后 ========
//
// var sceneType = self.imageRecognition.detectScene(screenshot);
// log(">>> 场景检测结果: " + sceneType + " | 当前状态: " + self.currentState);
//
// ↓↓↓ 在这里插入以下代码 ↓↓↓


// ========== 调试截图：关键节点自动保存 ==========
var needDebugShot = false;
var debugLabel = "";

// 统计连续 UNKNOWN 次数
if (sceneType === "UNKNOWN") {
    unknownCount++;
    log("[!!] 连续第 " + unknownCount + " 次 UNKNOWN");
    // 每次UNKNOWN都保存截图（前3次每次都保存，之后每5次保存一次）
    if (unknownCount <= 3 || unknownCount % 5 === 0) {
        needDebugShot = true;
        debugLabel = self.currentState + "_UNKNOWN_" + unknownCount;
    }
    if (unknownCount >= 3) {
        toast("⚠ 无法识别屏幕(连续" + unknownCount + "次)\n请确认游戏在前台");
        if (unknownCount % 5 === 0) {
            log("!!! 已连续 " + unknownCount + " 次无法识别场景！");
        }
    }
} else {
    // 状态和场景不匹配时保存截图
    if (self.currentState !== "IDLE" && self.currentState !== "INIT"
        && sceneType !== self.currentState
        && !sceneType.startsWith(self.currentState.split("_")[0] + "_")) {
        // 非预期的场景切换，保存截图
        needDebugShot = true;
        debugLabel = self.currentState + "_GOT_" + sceneType;
    }
    unknownCount = 0;
}

// 执行调试截图保存
if (needDebugShot) {
    self.imageRecognition.saveDebugShot(screenshot, debugLabel);
}


// ↑↑↑ 插入结束 ↑↑↑
//
// 后续代码正常继续:
// self._updateDebugInfo(self.currentState, sceneType, loopCount, unknownCount);
// self.processStateMachine(sceneType, screenshot);
// screenshot.recycle();



// ========== 同时替换 catch 块为以下版本（出错时也保存截图）==========
//
// 原始 catch:
//   } catch (e) {
//       log("[错误] 任务执行出错: " + e.message);
//       log("[错误] 堆栈: " + e.stack || "");
//       sleep(3000);
//   }
//
// 替换为:
} catch (e) {
    log("[错误] 任务执行出错: " + e.message);
    log("[错误] 堆栈: " + e.stack || "");
    // 出错时也尝试保存当前屏幕截图
    try {
        var errScreen = self.imageRecognition.captureScreen();
        if (errScreen) {
            self.imageRecognition.saveDebugShot(
                errScreen,
                "ERROR_" + e.message.replace(/[^a-zA-Z0-9_]/g, "_").substring(0, 30)
            );
            errScreen.recycle();
        }
    } catch (shotErr) {}
    sleep(3000);
}
