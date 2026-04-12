/**
 * 卡密验证模块
 * 使用 AutoX.js storages API 持久化卡密状态
 */

var STORAGE_NAME = "zombie_assistant_cardkey";

var CardKeyManager = {
    storage: null,

    init: function () {
        if (!this.storage) {
            this.storage = storages.create(STORAGE_NAME);
        }
    },

    /**
     * 验证卡密是否有效
     */
    verify: function () {
        this.init();
        var cardKey = this.storage.get("card_key", "");
        var isActivated = this.storage.get("is_activated", false);
        var expireTime = this.storage.get("expire_time", 0);

        if (!isActivated || !cardKey) {
            return false;
        }

        // 检查是否过期
        if (expireTime > 0 && Date.now() > expireTime) {
            return false;
        }

        return true;
    },

    /**
     * 激活卡密
     * @param {string} key 卡密字符串
     * @returns {boolean} 是否激活成功
     */
    activate: function (key) {
        if (!key || key.length < 8) {
            return false;
        }

        // 本地验证逻辑（可扩展为在线验证）
        var valid = this.validateKey(key);
        if (valid) {
            this.init();
            this.storage.put("card_key", key);
            this.storage.put("is_activated", true);
            // 默认30天有效期
            this.storage.put("expire_time", Date.now() + 30 * 24 * 60 * 60 * 1000);
            return true;
        }

        return false;
    },

    /**
     * 验证卡密格式
     */
    validateKey: function (key) {
        if (!key || key.length < 8) return false;

        // 基本格式验证：字母数字混合
        var regex = /^[A-Za-z0-9]{8,}$/;
        if (!regex.test(key)) return false;

        // 简单校验和验证（可替换为在线验证）
        var sum = 0;
        for (var i = 0; i < key.length; i++) {
            sum += key.charCodeAt(i);
        }
        return sum % 7 === 0;
    },

    /**
     * 在线验证（预留接口）
     */
    verifyOnline: function (key) {
        // TODO: 实现在线验证接口
        // var url = "https://your-server.com/api/verify";
        // var response = http.post(url, { key: key });
        // return response.body.json().valid;
        return false;
    },

    /**
     * 获取卡密信息
     */
    getInfo: function () {
        this.init();
        return {
            cardKey: this.storage.get("card_key", ""),
            isActivated: this.storage.get("is_activated", false),
            expireTime: this.storage.get("expire_time", 0),
            remainingDays: this.getRemainingDays()
        };
    },

    /**
     * 获取剩余天数
     */
    getRemainingDays: function () {
        this.init();
        var expireTime = this.storage.get("expire_time", 0);
        if (expireTime <= 0) return 0;
        var remaining = expireTime - Date.now();
        return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
    },

    /**
     * 注销卡密
     */
    deactivate: function () {
        this.init();
        this.storage.clear();
    }
};

module.exports = { CardKeyManager: CardKeyManager };
