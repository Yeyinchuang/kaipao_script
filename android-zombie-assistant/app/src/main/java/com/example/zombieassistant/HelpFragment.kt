package com.example.zombieassistant

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import com.example.zombieassistant.databinding.FragmentHelpBinding

class HelpFragment : Fragment() {

    private lateinit var binding: FragmentHelpBinding

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        binding = FragmentHelpBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // 设置使用说明内容
        binding.tvHelpContent.text = "使用说明:\n\n"
        +"1. 首次使用请先在设置页面输入卡密\n"
        +"2. 选择需要执行的任务\n"
        +"3. 调整相关参数设置\n"
        +"4. 点击加载按钮保存设置\n"
        +"5. 在脚本运行页面点击启动按钮开始执行\n"
        +"6. 确保游戏已打开并登录\n"
        +"7. 开启无障碍服务以支持自动化操作\n"
        +"\n注意事项:\n"
        +"- 请确保手机电量充足\n"
        +"- 运行过程中请勿手动操作手机\n"
        +"- 如遇问题，请检查卡密是否正确\n"
        +"- 本工具仅用于辅助游戏，请勿用于其他用途"
    }
}