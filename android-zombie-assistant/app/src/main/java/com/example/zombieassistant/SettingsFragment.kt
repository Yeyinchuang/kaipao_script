package com.example.zombieassistant

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import com.example.zombieassistant.databinding.FragmentSettingsBinding

class SettingsFragment : Fragment() {

    private lateinit var binding: FragmentSettingsBinding
    private lateinit var cardKeyManager: CardKeyManager

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        binding = FragmentSettingsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        
        cardKeyManager = CardKeyManager(requireContext())
        
        // 加载保存的卡密
        val savedCardKey = cardKeyManager.getSavedCardKey()
        if (savedCardKey != null) {
            binding.etCardKey.setText(savedCardKey)
        }

        // 加载按钮点击事件
        binding.btnLoad.setOnClickListener {
            val cardKey = binding.etCardKey.text.toString()
            
            // 在线验证卡密
            cardKeyManager.validateCardKeyOnline(cardKey) {
                requireActivity().runOnUiThread {
                    if (it) {
                        Toast.makeText(requireContext(), "卡密验证成功", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(requireContext(), "卡密验证失败", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }
}