/**
 * 配置管理模块
 * 使用 AutoX.js storages API 持久化配置
 */

var STORAGE_NAME = "zombie_assistant_config";

var DEFAULT_CONFIG = {
    task: {
        daily: true,
        main: true,
        rescue: true,
        expedition: true,
        countLimit: 100,
        teamTimeout: 300
    },
    recognition: {
        templateThreshold: 0.8,
        ocrEnabled: true,
        sceneCacheTime: 2000
    },
    operation: {
        clickDelay: 500,
        swipeDuration: 500,
        retryCount: 3
    },
    performance: {
        maxThreads: 4,
        imageCacheEnabled: true,
        memoryLimitMB: 200
    }
};

var ConfigManager = {
    storage: null,

    /**
     * 初始化存储
     */
    init: function () {
        if (!this.storage) {
            this.storage = storages.create(STORAGE_NAME);
        }
    },

    /**
     * 加载完整配置
     */
    loadConfig: function () {
        this.init();
        var config = {};
        var keys = Object.keys(DEFAULT_CONFIG);

        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var defaults = DEFAULT_CONFIG[key];
            config[key] = {};

            var subKeys = Object.keys(defaults);
            for (var j = 0; j < subKeys.length; j++) {
                var subKey = subKeys[j];
                var storageKey = key + "_" + subKey;
                var defaultVal = defaults[subKey];

                if (typeof defaultVal === "boolean") {
                    config[key][subKey] = this.storage.get(storageKey, defaultVal);
                } else if (typeof defaultVal === "number") {
                    config[key][subKey] = this.storage.get(storageKey, defaultVal);
                } else {
                    config[key][subKey] = this.storage.get(storageKey, defaultVal);
                }
            }
        }

        return config;
    },

    /**
     * 保存配置
     */
    saveConfig: function (config) {
        this.init();
        var keys = Object.keys(config);

        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var subConfig = config[key];
            var subKeys = Object.keys(subConfig);

            for (var j = 0; j < subKeys.length; j++) {
                var subKey = subKeys[j];
                var storageKey = key + "_" + subKey;
                this.storage.put(storageKey, subConfig[subKey]);
            }
        }
    },

    /**
     * 获取单个配置值
     */
    get: function (section, key) {
        this.init();
        var storageKey = section + "_" + key;
        var defaultVal = DEFAULT_CONFIG[section] ? DEFAULT_CONFIG[section][key] : null;
        return this.storage.get(storageKey, defaultVal);
    },

    /**
     * 设置单个配置值
     */
    set: function (section, key, value) {
        this.init();
        var storageKey = section + "_" + key;
        this.storage.put(storageKey, value);
    },

    /**
     * 重置所有配置
     */
    resetConfig: function () {
        this.init();
        this.storage.clear();
    },

    /**
     * 获取默认配置
     */
    getDefaults: function () {
        return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }
};

module.exports = { ConfigManager: ConfigManager };
