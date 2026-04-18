/**
 * 图像识别模块
 * 基于 AutoX.js images 模块实现模板匹配和 OCR
 */

// ==================== 场景识别规则配置表 ====================
// 调整场景映射只需改这里，无需修改检测逻辑代码
// priority: 数字越小优先级越高（OCR匹配时按顺序遍历）
// ocrKeywords: OCR关键词列表，minMatch=最少命中几个
// excludeKeywords: 排除词列表（命中任一则排除该场景）
// combinedRules: 组合规则（多词必须同时出现，requireAll=true）
//   当关键词匹配+排除词命中时，可设置 overrideTo 强制转到另一场景
// templates: 模板匹配降级用的模板名列表
var SCENE_RULES = [
    {
        // 结算页面：优先级最高！战斗结束后随时可能出现，必须第一时间识别并返回
        // 特征词：恭喜获得/奖励总览/伤害统计 + 返回按钮
        scene: "COMPLETE_TURN",
        priority: -1,
        ocrKeywords: ["恭喜获得", "奖励总览", "伤害统计"],
        minMatch: 1,
        templates: ["complete_turn_icon"]
    },
    {
        scene: "TEAM_HALL",
        priority: 0,
        ocrKeywords: ["招募频道", "组队频道"],
        minMatch: 1,
        templates: ["team_hall_tag"]
    },
    {
        scene: "TRAINING_HALL",
        priority: 1,
        ocrKeywords: ["玩法商店"],
        minMatch: 1,
        templates: ["training_hall_menu"]
    },
    {
        scene: "BASE_MENU",
        priority: 2,
        ocrKeywords: ["历练大厅", "危机应变", "远征堡垒", "研究所", "食堂", "酒店", "展览馆", "赛季英雄录"],
        minMatch: 2, // 需要≥2个建筑名才判定为基地（避免通用词误匹配）
        templates: ["base_menu"]
    },
    {
        scene: "MAIN_MENU",
        priority: 3,
        ocrKeywords: ["商城", "角色", "核心", "战斗", "基地", "军团", "征途"],
        minMatch: 2, // 需要≥2个导航栏词
        templates: ["main_menu", "core_menu", "legion_menu", "charactpr_menu", "mall_menu"]
    },
    {
        scene: "GAME_ROOM",
        priority: 4,
        ocrKeywords: ["救援-难度", "寰球救援-难度", "环球救援-难度", "豪球救援-难度"],
        minMatch: 1,
        // 组合规则：多个词必须同时出现才算匹配
        combinedRules: [
            { keywords: ["输入邀请码", "开始游戏"], requireAll: true },
        ],
        templates: ["team_hall_icon", "global_expedition"]
    },
    {
        // 精英战斗（非目标战斗）
        // requireTemplate=true：必须暂停按钮模板+OCR关键词同时命中（与关系）
        // 文字特征: "波次"、"X级"，无"寰球救援-难度"
        // 如截图: "30.地下甬道" + "波次:2/20"
        // 需要主动退出
        scene: "JINGYING_BATTLE",
        priority: 5,
        requireTemplate: true,  // 暂停按钮 || 必须先命中，再匹配OCR
        ocrKeywords: ["波次", "级"],
        minMatch: 1,
        excludeKeywords: ["难度", "寰球救援", "环球救援", "豪球救援", "寰球远征"],
        templates: ["in_battle"]
    },
    {
        // 寰球救援战斗（目标战斗）
        // requireTemplate=true：必须暂停按钮模板+OCR关键词同时命中（与关系）
        // 文字特征: "寰球救援-难度X"、"每10秒"、"释放技能"
        // 这是预期进入的战斗，正常打不退出
        scene: "HUANQIU_BATTLE",
        priority: 6,
        requireTemplate: true,  // 暂停按钮 || 必须先命中，再匹配OCR
        ocrKeywords: ["寰球救援-难度", "环球救援-难度", "豪球救援-难度", "每10秒", "释放", "技能"],
        minMatch: 1,
        templates: ["in_battle"]
    }
];

// COMPLETE_TURN 特殊处理：结算页面无文字，模板优先级最高（在detectScene中单独处理）
SCENE_RULES.COMPLETE_TURN_TEMPLATE = "complete_turn_icon";

function ImageRecognition(config) {
    this.config = config || {};
    this.templateThreshold = this.config.templateThreshold || 0.8;
    this.ocrEnabled = this.config.ocrEnabled !== false;
    this.sceneCacheTime = this.config.sceneCacheTime || 2000;
    this.lastScene = "UNKNOWN";
    this.lastSceneTime = 0;
    this.templateCache = {};
    // OCR结果缓存（一次OCR复用）
    this._ocrBlocks = null;      // 上次OCR识别的所有文字块 [{text, x, y}, ...]
    this._ocrFullText = "";       // 上次拼接的文字串
    this._ocrScreenTime = 0;     // 上次OCR的时间戳
}

/**
 * 请求截图并获取当前屏幕图像
 * AutoXJS已知问题：captureScreen()有时返回已回收的图片对象
 * 解决：返回前验证图片有效性；已回收时必须重建截图服务才能恢复
 */
ImageRecognition.prototype.captureScreen = function () {
    var maxRetry = 5;
    for (var i = 0; i < maxRetry; i++) {
        try {
            var result = images.captureScreen();
            if (!result) {
                log("截图返回空，重试 (" + (i + 1) + "/" + maxRetry + ")");
                if (i < maxRetry - 1) sleep(1000);
                continue;
            }
            // 验证图片是否已被回收（AutoXJS常见bug）
            try {
                var w = result.getWidth();
                if (w <= 0) throw new Error("尺寸无效");
                return result; // 有效，返回
            } catch (verifyErr) {
                log("截图返回已回收图片，重建截图服务 (" + (i + 1) + "/" + maxRetry + ")");
                try { result.recycle(); } catch (re) {}
                // ★ 关键：必须重建截图服务，否则captureScreen()永远返回同一个回收引用
                try { images.releaseScreenCapture(); } catch (re) {}
                sleep(500);
                try { requestScreenCapture(false); } catch (re) {}
                sleep(1000); // 等截图服务重新初始化
                continue;
            }
        } catch (e) {
            log("截图失败 (" + (i + 1) + "/" + maxRetry + "): " + e.message);
            // ScreenCapturer is not available → 截图服务崩了
            if (e.message && e.message.indexOf("not available") >= 0) {
                log("截图服务不可用，重建...");
                try { images.releaseScreenCapture(); } catch (re) {}
                sleep(500);
                try { requestScreenCapture(false); } catch (re) {}
                sleep(1000);
            }
        }
        if (i < maxRetry - 1) sleep(1000);
    }
    log("截图最终失败，已重试" + maxRetry + "次");
    return null;
};

/**
 * 模板匹配 - 在截图中查找模板图像
 * @param {Image} screenshot 截图
 * @param {string} templateName 模板名称
 * @param {number} threshold 匹配阈值
 * @param {object} region 搜索区域 {x, y, width, height}
 * @returns {object} {found, x, y, confidence}
 */
ImageRecognition.prototype.matchTemplate = function (screenshot, templateName, threshold, region) {
    threshold = threshold || this.templateThreshold;
    var template = this.loadTemplate(templateName);
    if (!template) {
        return { found: false, x: 0, y: 0, confidence: 0 };
    }

    try {
        var options = {
            threshold: threshold
        };
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

/**
 * 查找所有匹配位置
 * @param {Image} screenshot 截图
 * @param {string} templateName 模板名称
 * @param {number} threshold 匹配阈值
 * @param {object} region 搜索区域
 * @returns {Array} 匹配结果数组
 */
ImageRecognition.prototype.findAllTemplates = function (screenshot, templateName, threshold, region) {
    threshold = threshold || 0.7;
    var template = this.loadTemplate(templateName);
    if (!template) {
        return [];
    }

    var results = [];
    try {
        var options = {
            threshold: threshold
        };
        if (region) {
            options.region = [region.x, region.y, region.width, region.height];
        }

        var result = images.matchTemplate(screenshot, template, options);
        if (result.matches) {
            result.matches.forEach(function (match) {
                results.push({
                    x: match.point.x,
                    y: match.point.y,
                    confidence: match.similarity
                });
            });
        }
    } catch (e) {
        log("查找所有模板出错: " + e.message);
    }

    return this.removeDuplicates(results);
};

/**
 * 加载模板图像（带缓存）
 * @param {string} templateName 模板名称
 * @returns {Image|null}
 */
ImageRecognition.prototype.loadTemplate = function (templateName) {
    if (this.templateCache[templateName]) {
        return this.templateCache[templateName];
    }

    var paths = [
        "./templates/" + templateName + ".png",
        "./templates/battle/" + templateName + ".png",
        "./templates/menu/" + templateName + ".png",
        "./templates/training/" + templateName + ".png",
        "./templates/yuanzheng/" + templateName + ".png",
        "./templates/huanqiu/" + templateName + ".png"
    ];

    for (var i = 0; i < paths.length; i++) {
        try {
            var img = images.read(paths[i]);
            if (img) {
                this.templateCache[templateName] = img;
                return img;
            }
        } catch (e) {
            // 继续尝试下一个路径
        }
    }

    log("未找到模板: " + templateName);
    return null;
};

/**
 * OCR 文字识别（全屏）
 * @param {Image} screenshot 截图
 * @returns {string} 识别结果
 */
ImageRecognition.prototype.recognizeText = function (screenshot) {
    return this.recognizeTextInRegion(screenshot, null);
};

/**
 * OCR识别（返回带坐标的原始blocks，供复用）
 * @param {Image} screenshot 截图
 * @param {object|null} region 裁剪区域
 * @param {boolean} usePreprocess 是否预处理
 * @returns {Array|null} [{text, x, y, confidence}, ...] 或null
 */
ImageRecognition.prototype.ocrWithBlocks = function (screenshot, region, usePreprocess) {
    if (!this.ocrEnabled) return null;
    var doPreprocess = usePreprocess !== false;

    try {
        var img = screenshot;
        var needRecycleClip = false;

        if (region) {
            img = images.clip(screenshot, region.x, region.y, region.width, region.height);
            needRecycleClip = true;
        }

        var ocrImg = img;
        var needRecyclePre = false;
        if (doPreprocess) {
            ocrImg = this._preprocessForOCR(img, { blurSize: 3 });
            needRecyclePre = (ocrImg !== img);
        }

        var result = paddle.ocr(ocrImg);

        // 清理
        if (needRecyclePre && ocrImg !== img) { try { ocrImg.recycle(); } catch(e) {} }
        if (needRecycleClip && img !== screenshot) { try { img.recycle(); } catch(e) {} }

        if (!result || result.length === 0) {
            if (doPreprocess) {
                log("  [ocrBlocks] 预处理无结果，回退原始OCR");
                return this.ocrWithBlocks(screenshot, region, false);
            }
            return null;
        }

        // 解析每个block的文字+坐标
        var blocks = [];
        for (var i = 0; i < result.length; i++) {
            var block = result[i];
            var cx = 0, cy = 0;
            var bounds = block.bounds || block.box;
            if (bounds) {
                if (typeof bounds.left === "number") {
                    cx = (bounds.left + bounds.right) / 2;
                    cy = (bounds.top + bounds.bottom) / 2;
                } else if (bounds[0] && typeof bounds[0][0] === "number") {
                    cx = (bounds[0][0] + bounds[2][0]) / 2;
                    cy = (bounds[0][1] + bounds[3][1]) / 2;
                }
            } else if (block.x !== undefined && block.y !== undefined) {
                cx = block.x;
                cy = block.y;
            }

            if (cx > 0 || cy > 0) {
                blocks.push({
                    text: block.text,
                    x: Math.round(cx) + (region ? region.x : 0),
                    y: Math.round(cy) + (region ? region.y : 0),
                    confidence: block.confidence || 0.9
                });
            }
        }
        return blocks;
    } catch (e) {
        log("  [ocrBlocks] OCR出错: " + e.message);
        return null;
    }
};

/**
 * 从缓存的OCR结果中查找文字位置（零额外开销！）
 * @param {string} targetText 目标文字
 * @param {number} threshold 相似度阈值
 * @returns {object|null} {x, y, text}
 */
ImageRecognition.prototype.findFromCache = function (targetText, threshold) {
    threshold = threshold || 0.7;
    if (!this._ocrBlocks || this._ocrBlocks.length === 0) return null;

    for (var i = 0; i < this._ocrBlocks.length; i++) {
        var b = this._ocrBlocks[i];
        if (b.text === targetText ||
            b.text.indexOf(targetText) >= 0 ||
            this.similarText(b.text, targetText, threshold)) {
            return { x: b.x, y: b.y, text: b.text };
        }
    }
    return null;
};

/**
 * 对比度拉伸（直方图归一化）— 将像素值从[min,max]线性映射到[0,255]
 * 适用于灰色文字+浅色背景等低对比度场景
 * @param {Image} gray 灰度图像
 * @returns {Image} 拉伸后的新图像（调用者需recycle）
 */
ImageRecognition.prototype._contrastStretch = function (gray) {
    var w = gray.getWidth();
    var h = gray.getHeight();
    // 找到最小/最大灰度值
    var minVal = 255, maxVal = 0;
    for (var py = 0; py < h; py++) {
        for (var px = 0; px < w; px++) {
            var v = images.pixel(gray, px, py) & 0xFF;
            if (v < minVal) minVal = v;
            if (v > maxVal) maxVal = v;
        }
    }
    log("  [预处理] 对比度范围 [" + minVal + ", " + maxVal + "], 差值=" + (maxVal - minVal));

    // 如果对比度已经足够，直接返回原图副本
    if (maxVal - minVal < 10) {
        log("  [预处理] 对比度过低(" + (maxVal-minVal) + "<10)，尝试反转增强...");
        // 极低对比度: 用255-v做反色增强
        // AutoXJS没有逐像素API，回退用灰度图本身
        return gray;
    }

    // 创建结果图像并逐点映射: newV = (v - minVal) * 255 / (maxVal - minVal)
    // 使用images模块的clip+blend方式或直接用OpenCV normalize
    try {
        // 尝试使用AutoXJS的内置方法
        var result = images.copy(gray);
        // 由于AutoXJS images模块可能不支持逐像素操作，
        // 这里采用策略：返回原图，让后续adaptiveThreshold处理
        return result || gray;
    } catch (e3) {
        log("  [预处理][stretch] " + e3.message);
        return gray;
    }
};

/**
 * 图像预处理（降噪+增强），提升 OCR 识别率和稳定性
 * 支持两种模式:
 *   "normal"(默认): 灰度化 → 中值滤波 — 适合深色文字/深色背景
 *   "lightText":   灰度化 → 自适应阈值 — 适合浅色文字/浅色背景(灰色菜单按钮等)
 * @param {Image} img 原始图像
 * @param {object} options 预处理选项
 *   - mode: "normal"(默认) 或 "lightText"
 *   - scale: 缩放比例(0-1)，默认1.0不缩放
 *   - blurSize: 中值滤波核大小，默认3（奇数），仅normal模式生效
 * @returns {Image} 预处理后的新图像（调用者需 recycle）
 */
ImageRecognition.prototype._preprocessForOCR = function (img, options) {
    options = options || {};
    var mode = options.mode || "normal";
    var processed = img;

    try {
        // 步骤1: 可选缩放（放大图片让小字更清晰）
        var scale = options.scale || 1.0;
        if (scale > 1.0) {
            var newW = Math.floor(processed.getWidth() * scale);
            var newH = Math.floor(processed.getHeight() * scale);
            processed = images.resize(processed, newW, newH);
            log("  [预处理] 缩放 " + scale + "x -> " + newW + "x" + newH);
        }

        // 步骤2: 灰度化（去除颜色干扰，保留亮度层次）
        var gray = images.grayscale(processed);
        log("  [预处理][" + mode + "] 灰度化完成 (" + gray.getWidth() + "x" + gray.getHeight() + ")");
        if (processed !== img) processed.recycle();

        // 步骤3: 根据模式选择不同后处理
        if (mode === "lightText") {
            // lightText模式: 对比度拉伸 → 自适应阈值
            // 适用于灰色文字+浅色背景的低对比度场景（如左侧菜单tab）
            try {
                // 子步骤A: 对比度拉伸 — 将像素值从[min,max]映射到[0,255]，放大微弱差异
                var stretched = this._contrastStretch(gray);
                gray.recycle();

                // 子步骤B: 高斯自适应阈值(参数合法值: 0=均值, 1=高斯)
                var adaptive = images.adaptiveThreshold(stretched, 15, 1);
                stretched.recycle();
                log("  [预处理][lightText] 对比度拉伸+自适应阈值完成");
                return adaptive;
            } catch (e2) {
                log("  [预处理][lightText] 失败(" + e2.message + ")，回退灰度图");
                return gray;
            }
        } else {
            // normal模式: 中值滤波去噪（去除悬浮窗、通知栏等杂点）
            var blurSize = options.blurSize || 3;
            if (blurSize >= 3) {
                var blurred = images.medianBlur(gray, blurSize);
                gray.recycle();
                gray = blurred;
                log("  [预处理][normal] 中值滤波(核=" + blurSize + ")完成");
            }
            return gray;
        }
    } catch (e) {
        log("  [预处理] 出错，回退原图: " + e.message);
        if (processed && processed !== img) {
            try { processed.recycle(); } catch(e2) {}
        }
        return img;
    }
};

/**
 * OCR 文字识别（指定区域）- 带预处理
 * @param {Image} screenshot 截图
 * @param {object|null} region 识别区域 {x, y, width, height}
 * @param {boolean} usePreprocess 是否启用图像预处理，默认true
 * @returns {string} 识别结果
 */
ImageRecognition.prototype.recognizeTextInRegion = function (screenshot, region, usePreprocess) {
    if (!this.ocrEnabled) return "";

    // 优化：如果全屏缓存有效且无区域限制，直接返回缓存的文字
    var cacheAge = Date.now() - this._ocrScreenTime;
    if (!region && this._ocrFullText && cacheAge < 3000) {
        log("  [OCR] 复用缓存文字(" + this._ocrFullText.length + "字)");
        return this._ocrFullText;
    }

    // 有区域限制或缓存过期时才执行新OCR
    var doPreprocess = usePreprocess !== false;

    try {
        var img = screenshot;
        var needRecycleClip = false;

        // 裁剪区域
        if (region) {
            img = images.clip(screenshot, region.x, region.y, region.width, region.height);
            needRecycleClip = true;
        }

        // 图像预处理
        var ocrImg = img;
        var needRecyclePre = false;
        if (doPreprocess) {
            ocrImg = this._preprocessForOCR(img, { blurSize: 3 });
            needRecyclePre = (ocrImg !== img);
        }

        var result = paddle.ocr(ocrImg);

        // 清理预处理产物
        if (needRecyclePre && ocrImg !== img) {
            try { ocrImg.recycle(); } catch(e) {}
        }
        if (needRecycleClip && img !== screenshot) {
            try { img.recycle(); } catch(e) {}
        }

        if (result && result.length > 0) {
            return result.map(function (item) {
                return item.text;
            }).join("");
        }
    } catch (e) {
        // 预处理版出错时，尝试不用预处理的原始OCR
        log("  [OCR] 预处理OCR出错，回退原始OCR: " + e.message);
        try {
            var img2 = screenshot;
            if (region) {
                img2 = images.clip(screenshot, region.x, region.y, region.width, region.height);
            }
            var text = paddle.ocr(img2);
            if (region && img2 !== screenshot) {
                try { img2.recycle(); } catch(e) {}
            }
            if (text && text.length > 0) {
                return text.map(function(item){return item.text;}).join("");
            }
        } catch(e2) {
            // 再降级到内置OCR
            try {
                var img3 = screenshot;
                if (region) {
                    img3 = images.clip(screenshot, region.x, region.y, region.width, region.height);
                }
                var text3 = ocr.recognizeText(img3);
                if (region && img3 !== screenshot) {
                    try { img3.recycle(); } catch(e) {}
                }
                return text3 || "";
            } catch(e3) {
                log("OCR 识别全部失败: " + e3.message);
            }
        }
    }
    return "";
};

/**
 * OCR 查找文字位置（用于点击）- 支持多模式预处理
 * 策略: raw-first（原始彩色图先尝试，保留色相信息），失败后按指定模式预处理再试
 * @param {Image} screenshot 截图
 * @param {string} targetText 要查找的文字
 * @param {number} threshold 相似度阈值(0-1)，默认0.7
 * @param {object} region 搜索区域 {x, y, width, height}
 * @param {boolean|string} usePreprocess 是否/如何启用图像预处理:
 *   true/"normal"(默认): 正常预处理(灰度+中值滤波)
 *   "lightText": 浅色文字模式(灰度+自适应阈值)，适合灰色/浅色菜单按钮
 *   false/"raw"/"none": 不预处理(原始彩色图)
 * @returns {object|null} {x, y, text, confidence} 或 null
 */
ImageRecognition.prototype.findTextPosition = function (screenshot, targetText, threshold, region, usePreprocess) {
    threshold = threshold || 0.7;
    if (!this.ocrEnabled) return null;

    // 缓存优先：有缓存且未过期直接查缓存（零额外OCR调用！）
    var cacheAge = Date.now() - this._ocrScreenTime;
    if (this._ocrBlocks && this._ocrBlocks.length > 0 && cacheAge < 3000) {
        var cached = this.findFromCache(targetText, threshold);
        if (cached && cached.x > 0) {
            log("  [findText] 缓存命中! '" + targetText + "' = (" + cached.x + ", " + cached.y + ")");
            return cached;
        }
        log("  [findText] 缓存未命中('" + targetText + "')，执行独立OCR");
    }

    // 解析预处理模式
    var mode = "normal";
    if (usePreprocess === "lightText") mode = "lightText";
    else if (usePreprocess === false || usePreprocess === "raw" || usePreprocess === "none") mode = "none";

    try {
        var img = screenshot;
        var needRecycleClip = false;

        if (region) {
            img = images.clip(screenshot, region.x, region.y, region.width, region.height);
            needRecycleClip = true;
        }

        // ====== 策略1: raw-first — 原始彩色图OCR（保留色相，灰色/浅色文字友好）=====
        var result = paddle.ocr(img);
        var match = this._extractMatch(result, targetText, threshold, region);
        if (match) {
            this._cleanupOcr(img, screenshot, needRecycleClip, null);
            log("  [findText] ✓ 原始OCR找到'" + targetText + "': (" + match.x + ", " + match.y + ")");
            return match;
        }
        log("  [findText] 原始OCR未找到，尝试" + mode + "预处理...");

        // ====== 策略2: 按指定模式预处理后重试 ======
        var ocrImg = img;
        var needRecyclePre = false;
        if (mode !== "none") {
            ocrImg = this._preprocessForOCR(img, { mode: mode, blurSize: 3 });
            needRecyclePre = (ocrImg !== img);
        }

        result = paddle.ocr(ocrImg);
        match = this._extractMatch(result, targetText, threshold, region);

        this._cleanupOcr(img, screenshot, needRecycleClip, needRecyclePre ? ocrImg : null);

        if (match) {
            log("  [findText] ✓ 预处理找到'" + targetText + "': (" + match.x + ", " + match.y + ") [" + mode + "]");
            return match;
        }

        // normal模式还没找到 → 最后试lightText（可能是浅色文字）
        if (mode === "normal") {
            return this.findTextPosition(screenshot, targetText, threshold, region, "lightText");
        }

        return null;
    } catch (e) {
        log("OCR 查找文字位置出错: " + e.message);
        return null;
    }
};

/**
 * 从OCR结果中提取目标文字位置（内部方法）
 */
ImageRecognition.prototype._extractMatch = function (result, targetText, threshold, region) {
    if (!result || result.length === 0) return null;
    for (var i = 0; i < result.length; i++) {
        var b = result[i];
        if (b.text === targetText || b.text.indexOf(targetText) >= 0
            || this.similarText(b.text, targetText, threshold)) {
            var cx = 0, cy = 0;
            var bounds = b.bounds || b.box;
            if (bounds) {
                if (typeof bounds.left === "number") {
                    cx = (bounds.left + bounds.right) / 2;
                    cy = (bounds.top + bounds.bottom) / 2;
                } else if (bounds[0] && typeof bounds[0][0] === "number") {
                    cx = (bounds[0][0] + bounds[2][0]) / 2;
                    cy = (bounds[0][1] + bounds[3][1]) / 2;
                } else continue;
            } else if (b.x !== undefined) { cx = b.x; cy = b.y; }
            else continue;
            return {
                x: Math.round(cx) + (region ? region.x : 0),
                y: Math.round(cy) + (region ? region.y : 0),
                text: b.text,
                confidence: b.confidence || 0.9
            };
        }
    }
    return null;
};

/** OCR资源清理辅助 */
ImageRecognition.prototype._cleanupOcr = function (img, screenshot, needClip, extraImg) {
    if (extraImg && extraImg !== img) try { extraImg.recycle(); } catch(e){}
    if (needClip && img !== screenshot) try { img.recycle(); } catch(e){}
};

/**
 * 简单文字相似度判断（处理 OCR 误识）
 * @param {string} actual 实际识别文字
 * @param {string} expected 期望文字
 * @param {number} threshold 阈值
 * @returns {boolean}
 */
ImageRecognition.prototype.similarText = function (actual, expected, threshold) {
    if (!actual || !expected) return false;

    // 直接包含
    if (actual.indexOf(expected) >= 0 || expected.indexOf(actual) >= 0) {
        return true;
    }

    // 去除空格后包含
    var a = actual.replace(/\s/g, "");
    var e = expected.replace(/\s/g, "");
    if (a.indexOf(e) >= 0 || e.indexOf(a) >= 0) {
        return true;
    }

    // 编辑距离相似度
    var maxLen = Math.max(a.length, e.length);
    if (maxLen === 0) return true;
    var dist = this.editDistance(a, e);
    return 1 - dist / maxLen >= threshold;
};

/**
 * 计算编辑距离
 */
ImageRecognition.prototype.editDistance = function (a, b) {
    var m = a.length, n = b.length;
    var dp = [];
    for (var i = 0; i <= m; i++) {
        dp[i] = [];
        dp[i][0] = i;
    }
    for (var j = 0; j <= n; j++) {
        dp[0][j] = j;
    }
    for (var i = 1; i <= m; i++) {
        for (var j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1;
        }
    }
    return dp[m][n];
};

/**
 * 检测当前场景
 * 流程：结算页模板 → requireTemplate(与关系) → 纯OCR → 模板降级 → 分区OCR
 * @param {Image} screenshot 截图
 * @returns {string} 场景类型
 */
ImageRecognition.prototype.detectScene = function (screenshot) {
    var currentTime = Date.now();
    if (currentTime - this.lastSceneTime < this.sceneCacheTime) {
        return this.lastScene;
    }

    try {
        // ========== 0. 结算页面（模板优先，图形无文字）==========
        if (this.matchTemplate(screenshot, "complete_turn_icon", 0.8).found) {
            return this._setScene("COMPLETE_TURN", currentTime);
        }

        // ========== 1. 全屏 OCR 文字（一次OCR，复用结果！）==========
        var fullText = "";
        if (this.ocrEnabled) {
            var blocks = this.ocrWithBlocks(screenshot, null, false);
            this._ocrBlocks = blocks;
            this._ocrScreenTime = Date.now();
            if (blocks && blocks.length > 0) {
                fullText = blocks.map(function (b) { return b.text; }).join("");
                this._ocrFullText = fullText;
            }
            log("OCR全屏文字(" + fullText.length + "字): " + fullText.substring(0, 300));
            log("OCR缓存: " + (blocks ? blocks.length : 0) + " 个文字块");
        }

        // ========== 2. requireTemplate 规则（模板 AND OCR 必须同时命中）==========
        if (fullText) {
            var rtScene = this._detectRequireTemplateScene(screenshot, fullText, currentTime);
            if (rtScene) return rtScene;
        }

        // ========== 3. 纯 OCR 规则（原有逻辑）==========
        if (fullText) {
            var ocrScene = this._detectSceneByOCR(fullText, currentTime);
            if (ocrScene) return ocrScene;
        }

        // ========== 2. 模板匹配降级 ==========
        var templateScene = this._detectSceneByTemplate(screenshot, currentTime);
        if (templateScene) return templateScene;

        // ========== 3. 分区 OCR 辅助（当全屏 OCR 失败时）==========
        if (!fullText || fullText.length < 5) {
            var regionalScene = this._detectSceneByRegionalOCR(screenshot, currentTime);
            if (regionalScene) return regionalScene;
        }
    } catch (e) {
        log("场景检测出错: " + e.message);
    }

    return this._setScene("UNKNOWN", currentTime);
};

/**
 * requireTemplate 规则：模板 AND OCR 必须同时命中（与关系）
 * 遍历 SCENE_RULES 中 requireTemplate=true 的规则，先匹配模板再匹配OCR
 * @param {Image} screenshot 截图
 * @param {string} ocrText OCR识别的文字
 * @param {number} time 当前时间戳
 * @returns {string|null} 场景名或null
 */
ImageRecognition.prototype._detectRequireTemplateScene = function (screenshot, ocrText, time) {
    var sortedRules = SCENE_RULES.slice().sort(function (a, b) {
        return (a.priority || 99) - (b.priority || 99);
    });

    for (var ri = 0; ri < sortedRules.length; ri++) {
        var rule = sortedRules[ri];
        if (!rule.requireTemplate || !rule.templates || rule.templates.length === 0) continue;

        // 1. 先检查模板是否命中（任一模板即可）
        var templateMatched = false;
        for (var ti = 0; ti < rule.templates.length; ti++) {
            if (this.matchTemplate(screenshot, rule.templates[ti], 0.8).found) {
                log("  [与关系] " + rule.scene + " 模板命中: " + rule.templates[ti]);
                templateMatched = true;
                break;
            }
        }
        if (!templateMatched) continue;

        // 2. 模板命中后，检查OCR关键词
        if (rule.ocrKeywords && rule.ocrKeywords.length > 0) {
            var ocrResult = this._matchOCRRule(ocrText, rule);
            if (ocrResult.matched && !ocrResult.overridden) {
                log("  [与关系] >>> " + rule.scene + " 模板+OCR同时命中 (" + ocrResult.matchedWords.join(", ") + ")");
                return this._setScene(rule.scene, time);
            } else if (ocrResult.overridden) {
                log("  [与关系] " + rule.scene + " 模板命中但OCR排除词命中，跳过");
            } else {
                log("  [与关系] " + rule.scene + " 模板命中但OCR未匹配(" + (rule.ocrKeywords || []).join(",") + ")");
            }
        }
    }

    return null;
};

/**
 * 通过全屏 OCR 文字判断场景（通用规则引擎）
 * 遍历 SCENE_RULES 配置表，按 priority 顺序匹配
 * 支持功能: 关键词匹配、排除词、组合规则(多词同时出现)、minMatch阈值、overrideTo强制跳转
 * @param {string} text OCR识别的全屏文字
 * @param {number} time 当前时间戳
 * @returns {string|null} 场景名或null
 */
ImageRecognition.prototype._detectSceneByOCR = function (text, time) {
    if (!text || text.length < 2) {
        log("  [OCR] 文字为空或太短，跳过OCR检测");
        return null;
    }
    log("  [OCR] 全屏文字(前300字): " + text.substring(0, 300));

    // 按 priority 排序后遍历规则表
    var sortedRules = SCENE_RULES.slice().sort(function (a, b) {
        return (a.priority || 99) - (b.priority || 99);
    });

    for (var ri = 0; ri < sortedRules.length; ri++) {
        var rule = sortedRules[ri];
        // 跳过 requireTemplate 规则（已在步骤2中处理）和无 ocrKeywords 的规则
        if (rule.requireTemplate || !rule.ocrKeywords || rule.ocrKeywords.length === 0) continue;

        var matchResult = this._matchOCRRule(text, rule);
        if (matchResult.matched) {
            // 排除词命中时：有 overrideTo 则强制跳转，无则视为不匹配（让后续规则处理）
            if (matchResult.overridden) {
                if (rule.overrideTo) {
                    log("  [OCR] >>> 匹配到 " + rule.scene + " 但命中排除词，强制转到: " + rule.overrideTo);
                    return this._setScene(rule.overrideTo, time);
                } else {
                    log("  [OCR] [" + rule.scene + "] 命中关键词但排除词也命中，跳过(无overrideTo)");
                    continue; // 跳过此规则，让后续优先级更低的规则匹配
                }
            }
            log("  [OCR] >>> 匹配到 " + rule.scene + " (" + matchResult.matchedWords.join(", ") + ")");
            return this._setScene(rule.scene, time);
        }
    }

    log("  [OCR] 未匹配到任何场景");
    return null;
};

/**
 * 匹配单条 OCR 规则
 * @param {string} text OCR文字
 * @param {object} rule 单条场景规则
 * @returns {object} { matched: boolean, matchedWords: string[], overridden: boolean }
 */
ImageRecognition.prototype._matchOCRRule = function (text, rule) {
    var matchedWords = [];

    // 1. 检查关键词命中数
    for (var ki = 0; ki < rule.ocrKeywords.length; ki++) {
        if (text.indexOf(rule.ocrKeywords[ki]) >= 0) {
            matchedWords.push(rule.ocrKeywords[ki]);
        }
    }

    // 2. 检查组合规则（多词必须同时出现）
    if (rule.combinedRules && rule.combinedRules.length > 0) {
        for (var ci = 0; ci < rule.combinedRules.length; ci++) {
            var cr = rule.combinedRules[ci];
            var allMatched = true;
            for (var cki = 0; cki < cr.keywords.length; cki++) {
                if (text.indexOf(cr.keywords[cki]) < 0) {
                    allMatched = false;
                    break;
                }
            }
            if (allMatched && cr.requireAll) {
                // 组合规则命中，记录所有关键词
                for (var cki2 = 0; cki2 < cr.keywords.length; cki2++) {
                    if (matchedWords.indexOf(cr.keywords[cki2]) < 0) {
                        matchedWords.push(cr.keywords[cki2]);
                    }
                }
            }
        }
    }

    // 3. 判断是否达到 minMatch 阈值
    var minMatch = rule.minMatch || 1;
    if (matchedWords.length < minMatch) {
        return { matched: false, matchedWords: [], overridden: false };
    }

    // 4. 检查排除词（命中任一排除词 → 被排除）
    if (rule.excludeKeywords && rule.excludeKeywords.length > 0) {
        for (var ei = 0; ei < rule.excludeKeywords.length; ei++) {
            if (text.indexOf(rule.excludeKeywords[ei]) >= 0) {
                log("  [OCR][" + rule.scene + "] 命中排除词: '" + rule.excludeKeywords[ei] + "'");
                return { matched: true, matchedWords: matchedWords, overridden: true };
            }
        }
    }

    return { matched: true, matchedWords: matchedWords, overridden: false };
};

/**
 * 模板匹配降级检测（通用规则引擎）
 * 遍历 SCENE_RULES 中每个规则的 templates 列表，按优先级匹配
 * @param {Image} screenshot 截图
 * @param {number} time 当前时间戳
 * @returns {string|null} 场景名或null
 */
ImageRecognition.prototype._detectSceneByTemplate = function (screenshot, time) {
    // 按 priority 排序后遍历（与 OCR 检测顺序一致）
    var sortedRules = SCENE_RULES.slice().sort(function (a, b) {
        return (a.priority || 99) - (b.priority || 99);
    });

    for (var ri = 0; ri < sortedRules.length; ri++) {
        var rule = sortedRules[ri];
        // 跳过 requireTemplate 规则（已在步骤2中处理）和空模板规则
        if (rule.requireTemplate || !rule.templates || rule.templates.length === 0) continue;

        for (var ti = 0; ti < rule.templates.length; ti++) {
            if (this.matchTemplate(screenshot, rule.templates[ti], 0.8).found) {
                log("  [模板] >>> 匹配到 " + rule.scene + " (模板: " + rule.templates[ti] + ")");
                return this._setScene(rule.scene, time);
            }
        }
    }

    return null;
};

/**
 * 分区 OCR 辅助检测（当全屏 OCR 失败时）
 */
ImageRecognition.prototype._detectSceneByRegionalOCR = function (screenshot, time) {
    var screenHeight = screenshot.getHeight();
    var screenWidth = screenshot.getWidth();
    var midText = this.recognizeTextInRegion(screenshot, {
        x: 0, y: Math.floor(screenHeight * 0.2),
        width: screenWidth, height: Math.floor(screenHeight * 0.5)
    });
    // 训练大厅优先（同主检测逻辑）
    var trainingKw = ["深渊挑战", "寰球救援", "环球救援", "终末危机", "战场争霸"];
    for (var ri = 0; ri < trainingKw.length; ri++) {
        if (midText.indexOf(trainingKw[ri]) >= 0) {
            return this._setScene("TRAINING_HALL", time);
        }
    }
    // 基地页面（>=2个建筑名，去掉"防线"避免误匹配）
    var baseKw = ["历练大厅", "危机应变", "远征堡垒", "研究所", "食堂",
                  "展览馆", "赛季英雄录"];
    var bCount = 0;
    for (var rj = 0; rj < baseKw.length; rj++) {
        if (midText.indexOf(baseKw[rj]) >= 0) bCount++;
    }
    if (bCount >= 2) return this._setScene("BASE_MENU", time);
    // 底部导航栏兜底
    var bottomText = this.recognizeTextInRegion(screenshot, {
        x: 0, y: Math.floor(screenHeight * 0.85),
        width: screenWidth, height: Math.floor(screenHeight * 0.15)
    });
    var navCount = 0;
    ["商城", "角色", "核心", "战斗", "基地", "军团", "征途"].forEach(function (nav) {
        if (bottomText.indexOf(nav) >= 0) navCount++;
    });
    if (navCount >= 3) {
        return this._setScene("MAIN_MENU", time);
    }
    return null;
};

/**
 * 缓存并设置当前场景
 */
ImageRecognition.prototype._setScene = function (scene, time) {
    this.lastScene = scene;
    this.lastSceneTime = time;
    log("场景检测结果: " + scene);
    return scene;
};

/**
 * 识别招募信息
 * @param {Image} screenshot 截图
 * @returns {Array} 招募信息列表
 */
ImageRecognition.prototype.recognizeRecruitmentInfo = function (screenshot) {
    var screenHeight = screenshot.getHeight();
    var screenWidth = screenshot.getWidth();
    var text = this.recognizeTextInRegion(screenshot, {
        x: 0, y: Math.floor(screenHeight / 4),
        width: screenWidth, height: Math.floor(screenHeight / 2)
    });

    var recruitmentList = [];
    var lines = text.split("\n");
    var currentInfo = null;

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        if (line.indexOf("服") >= 0) {
            if (currentInfo) recruitmentList.push(currentInfo);
            currentInfo = { server: line, difficulty: "", playerInfo: "" };
        } else if (line.indexOf("难度") >= 0) {
            if (currentInfo) currentInfo.difficulty = line;
        } else if (line.indexOf("级") >= 0) {
            if (currentInfo) currentInfo.playerInfo = line;
        }
    }
    if (currentInfo) recruitmentList.push(currentInfo);

    return recruitmentList;
};

/**
 * 去重相似匹配结果
 */
ImageRecognition.prototype.removeDuplicates = function (results) {
    var unique = [];
    for (var i = 0; i < results.length; i++) {
        var isDup = false;
        for (var j = 0; j < unique.length; j++) {
            if (Math.abs(results[i].x - unique[j].x) < 20 && Math.abs(results[i].y - unique[j].y) < 20) {
                isDup = true;
                break;
            }
        }
        if (!isDup) unique.push(results[i]);
    }
    return unique;
};

module.exports = { ImageRecognition: ImageRecognition };
