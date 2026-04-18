/**
 * 僵尸助手 - AutoX.js 自动化脚本
 * 主入口文件
 */
"auto";

var { ImageRecognition } = require("./modules/imageRecognition.js");
var { TaskManager } = require("./modules/taskManager.js");
var { ConfigManager } = require("./modules/configManager.js");
var { CardKeyManager } = require("./modules/cardKeyManager.js");

// 全局调试信息（先定义，再传给taskManager）
var debugInfo = { state: "待机", scene: "-", loopCount: 0, lastAction: "等待启动", unknownCount: 0 };

// 全局配置
var config = ConfigManager.loadConfig();
var imageRecognition = new ImageRecognition(config.recognition);
var taskManager = new TaskManager(config, imageRecognition, debugInfo);
var cardKeyManager = CardKeyManager;

// 运行标志
var isRunning = false;

/**
 * 主函数
 */
function main() {
    // 检查无障碍服务
    if (!auto.service) {
        toast("请先开启无障碍服务");
        auto.waitFor();
    }

    // 显示悬浮窗
    showFloaty();

    toast("请切到游戏，点[助手]→[启动]");

    // 保持脚本运行
    setInterval(function () {}, 1000);
}

/**
 * 显示悬浮控制窗
 */
function showFloaty() {
    var isExpanded = false;
    var window = floaty.rawWindow(
        <frame>
            <vertical id="panel" visibility="gone" bg="#cc000000" padding="6">
                <text id="status" textSize="11sp" textColor="#00ff00" padding="3">待机</text>
                <horizontal>
                    <button id="btnStart" textSize="9sp" w="45" h="26">启动</button>
                    <button id="btnStop" textSize="9sp" w="45" h="26">停止</button>
                    <button id="btnClose" textSize="9sp" w="45" h="26">关闭</button>
                </horizontal>
            </vertical>
            <vertical id="tab" bg="#cc3333" w="22">
                <text textColor="#ffffff" textSize="10sp" rotation="90" gravity="center" padding="2">助手</text>
            </vertical>
        </frame>
    );
    window.setSize(-2, -2);

    // 定位到屏幕右侧边缘
    var sw = device.width || 720;
    window.setPosition(sw - 24, 200);

    // 点击侧边栏切换展开/收起
    window.tab.on("click", function () {
        isExpanded = !isExpanded;
        window.panel.setVisibility(isExpanded ? 0 : 8);
        if (isExpanded) {
            window.setPosition(sw - 170, 200);
        } else {
            window.setPosition(sw - 24, 200);
        }
    });

    // 点启动 → 子线程截图 + 跑任务
    window.btnStart.on("click", function () {
        if (isRunning) return;
        threads.start(function () {
            var pkg = currentPackage();
            log("[启动] 前台包名: " + pkg);

            // 如果还在 AutoXJS/桌面，提示切到游戏
            if (pkg.indexOf("autoxjs") >= 0 || pkg.indexOf("systemui") >= 0 || 
                pkg.indexOf("lawnchair") >= 0 || pkg.indexOf("launcher") >= 0) {
                toast("请先切到游戏再点启动！");
                return;
            }

            // 请求截图权限（此时前台是游戏，截图锁定游戏窗口）
            log("[启动] 请求截图权限...");
            var capResult = false;
            try { capResult = requestScreenCapture(true); } catch (e) {}
            if (!capResult) {
                try { capResult = requestScreenCapture(false); } catch (e) {}
            }
            if (!capResult) {
                toast("截图权限获取失败！");
                return;
            }
            log("[启动] 截图权限已获取, 前台包名: " + currentPackage());

            isRunning = true;
            taskManager.start();
            ui.post(function () {
                window.status.setText("运行中");
                toast("已启动");
            });
        });
    });

    window.btnStop.on("click", function () {
        isRunning = false;
        taskManager.stop();
        window.status.setText("已停止");
        toast("已停止");
    });

    window.btnClose.on("click", function () {
        isRunning = false;
        taskManager.stop();
        toast("已关闭");
        exit();
    });

    // 定时刷新状态
    setInterval(function () {
        if (isRunning) {
            ui.run(function () {
                var mark = "";
                if (debugInfo.scene === "UNKNOWN") mark = "[!]";
                else if (debugInfo.scene && debugInfo.scene !== "-" && debugInfo.scene !== "UNKNOWN") mark = "[OK]";
                var txt = "状态:" + debugInfo.state + "\n场景:" + debugInfo.scene + mark + " 循环:" + debugInfo.loopCount;
                window.status.setText(txt);
            });
        }
    }, 500);

    return window;
}

// 启动
main();
