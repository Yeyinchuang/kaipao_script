package com.example.zombieassistant

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import com.example.zombieassistant.databinding.FragmentRunBinding

class RunFragment : Fragment() {

    private lateinit var binding: FragmentRunBinding
    private var isRunning = false

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        binding = FragmentRunBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // 启动按钮点击事件
        binding.btnStart.setOnClickListener {
            if (!isRunning) {
                startZombieService()
                binding.btnStart.text = "停止"
                isRunning = true
            } else {
                stopZombieService()
                binding.btnStart.text = "启动"
                isRunning = false
            }
        }
    }

    private fun startZombieService() {
        val intent = Intent(requireContext(), ZombieForegroundService::class.java)
        requireContext().startForegroundService(intent)
    }

    private fun stopZombieService() {
        val intent = Intent(requireContext(), ZombieForegroundService::class.java)
        requireContext().stopService(intent)
    }
}