package com.example.zombieassistant

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import com.example.zombieassistant.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var cardKeyManager: CardKeyManager
    private var isAccessibilityServiceEnabled = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // 初始化卡密管理器
        cardKeyManager = CardKeyManager(this)

        // 检查卡密是否有效
        checkCardKey()

        // 检查无障碍服务是否开启
        checkAccessibilityService()

        // 设置底部导航
        binding.bottomNav.setOnItemSelectedListener {
            when (it.itemId) {
                R.id.nav_settings -> {
                    replaceFragment(SettingsFragment())
                    true
                }
                R.id.nav_run -> {
                    if (cardKeyManager.isCardKeyValid()) {
                        replaceFragment(RunFragment())
                    } else {
                        // 显示卡密无效提示
                        replaceFragment(SettingsFragment())
                        Log.d("MainActivity", "卡密无效，无法进入运行页面")
                    }
                    true
                }
                R.id.nav_help -> {
                    replaceFragment(HelpFragment())
                    true
                }
                else -> false
            }
        }

        // 默认显示设置页面
        replaceFragment(SettingsFragment())
    }

    override fun onResume() {
        super.onResume()
        // 再次检查无障碍服务状态
        checkAccessibilityService()
    }

    private fun replaceFragment(fragment: Fragment) {
        supportFragmentManager.beginTransaction()
            .replace(R.id.fragment_container, fragment)
            .commit()
    }

    private fun checkCardKey() {
        val isValid = cardKeyManager.isCardKeyValid()
        Log.d("MainActivity", "卡密验证结果: $isValid")
        if (!isValid) {
            // 可以在这里显示卡密无效的提示
            Log.d("MainActivity", "卡密无效，请输入有效的卡密")
        }
    }

    private fun checkAccessibilityService() {
        val serviceEnabled = isAccessibilityServiceEnabled()
        isAccessibilityServiceEnabled = serviceEnabled
        Log.d("MainActivity", "无障碍服务状态: $serviceEnabled")

        if (!serviceEnabled) {
            // 引导用户开启无障碍服务
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            startActivity(intent)
        }
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        val serviceName = "com.example.zombieassistant/.ZombieAccessibilityService"
        val accessibilityEnabled = Settings.Secure.getInt(
            contentResolver,
            Settings.Secure.ACCESSIBILITY_ENABLED,
            0
        ) == 1

        if (!accessibilityEnabled) {
            return false
        }

        val enabledServices = Settings.Secure.getString(
            contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        )

        return enabledServices?.contains(serviceName) ?: false
    }

    fun getCardKeyManager(): CardKeyManager {
        return cardKeyManager
    }

    fun isAccessibilityServiceReady(): Boolean {
        return isAccessibilityServiceEnabled
    }
}