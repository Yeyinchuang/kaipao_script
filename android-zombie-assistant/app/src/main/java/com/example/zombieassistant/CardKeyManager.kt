package com.example.zombieassistant

import android.content.Context
import android.content.SharedPreferences
import android.util.Log

class CardKeyManager(private val context: Context) {

    private val sharedPreferences: SharedPreferences = 
        context.getSharedPreferences("ZombieAssistant", Context.MODE_PRIVATE)

    /**
     * 验证卡密
     */
    fun validateCardKey(cardKey: String): Boolean {
        // 简单的卡密验证逻辑
        // 实际项目中应该连接服务器进行验证
        val isValid = cardKey.isNotEmpty() && cardKey.length >= 8
        
        if (isValid) {
            saveCardKey(cardKey)
            Log.d("CardKeyManager", "卡密验证成功: $cardKey")
        } else {
            Log.d("CardKeyManager", "卡密验证失败: $cardKey")
        }
        
        return isValid
    }

    /**
     * 保存卡密
     */
    fun saveCardKey(cardKey: String) {
        sharedPreferences.edit().putString("cardKey", cardKey).apply()
    }

    /**
     * 获取保存的卡密
     */
    fun getSavedCardKey(): String? {
        return sharedPreferences.getString("cardKey", null)
    }

    /**
     * 检查卡密是否有效
     */
    fun isCardKeyValid(): Boolean {
        val cardKey = getSavedCardKey()
        return cardKey != null && cardKey.length >= 8
    }

    /**
     * 清除卡密
     */
    fun clearCardKey() {
        sharedPreferences.edit().remove("cardKey").apply()
    }

    /**
     * 在线验证卡密
     */
    fun validateCardKeyOnline(cardKey: String, callback: (Boolean) -> Unit) {
        // 模拟网络请求验证卡密
        // 实际项目中应该连接服务器进行验证
        Thread {
            try {
                // 模拟网络延迟
                Thread.sleep(1000)
                // 简单验证逻辑
                val isValid = cardKey.isNotEmpty() && cardKey.length >= 8
                callback(isValid)
            } catch (e: Exception) {
                e.printStackTrace()
                callback(false)
            }
        }.start()
    }
}