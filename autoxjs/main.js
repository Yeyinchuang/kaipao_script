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
    // 请求截图权限
    if (!requestScreenCapture(false)) {
        toast("请求截图失败");
        exit();
    }

    // 检查无障碍服务
    if (!auto.service) {
        toast("请先开启无障碍服务");
        auto.waitFor();
    }

    // 显示悬浮窗
    showFloaty();

    // 卡密验证（已屏蔽）
    // if (!cardKeyManager.verify()) {
    //     showCardKeyDialog();
    //     return;
    // }

    toast("僵尸助手已启动");
    isRunning = true;

    // 启动任务循环
    taskManager.start();

    // 保持脚本运行
    setInterval(function () {}, 1000);
}

/**
 * 显示悬浮控制窗（保持原布局 + 动态更新）
 */
function showFloaty() {
    // 侧边收起式悬浮窗：默认只显示一个小条，点击展开/收起
    var isExpanded = false;
    var window = floaty.window(
        <frame>
            <vertical id="panel" visibility="gone" bg="#cc000000" padding="6">
                <text id="status" textSize="11sp" textColor="#00ff00" padding="3">待机</text>
                <horizontal>
                    <button id="btnStart" textSize="9sp" w="45" h="26">启动</button>
                    <button id="btnStop" textSize="9sp" w="45" h="26">停止</button>
                    <button id="btnClose" textSize="9sp" w="45" h="26">关闭</button>
                </horizontal>
            </vertical>
            <vertical id="tab" bg="#88000000" w="16">
                <text textColor="#aaaaaa" textSize="10sp" rotation="90" gravity="center" padding="2">助手</text>
            </vertical>
        </frame>
    );

    // 定位到屏幕右侧边缘
    var sw = device.width || 720;
    window.setPosition(sw - 18, 200);

    // 点击侧边栏切换展开/收起
    window.tab.on("click", function () {
        isExpanded = !isExpanded;
        window.panel.setVisibility(isExpanded ? 0 : 8); // 0=VISIBLE, 8=GONE
        if (isExpanded) {
            window.setPosition(sw - 175, 200);
        } else {
            window.setPosition(sw - 18, 200);
        }
    });

    window.btnStart.on("click", function () {
        if (!isRunning) {
            isRunning = true;
            taskManager.start();
            window.status.setText("状态: 运行中");
            toast("已启动");
        }
    });

    window.btnStop.on("click", function () {
        isRunning = false;
        taskManager.stop();
        window.status.setText("状态: 已停止");
        toast("已停止");
    });

    window.btnClose.on("click", function () {
        isRunning = false;
        taskManager.stop();
        toast("已关闭");
        exit();  // 真正停止脚本
    });

    // 定时刷新状态（每500ms更新调试信息到悬浮窗）
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

/**
 * 显示卡密输入对话框
 */
function showCardKeyDialog() {
    dialogs.rawInput("请输入卡密").then(function (key) {
        if (key && cardKeyManager.activate(key)) {
            toast("激活成功");
            main();
        } else {
            toast("卡密无效");
            showCardKeyDialog();
        }
    });
}

// 启动
main();
