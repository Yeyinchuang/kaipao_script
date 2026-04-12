#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试模拟器连接和基本功能
"""

import time
from emulator_controller import EmulatorController


def test_emulator_connection():
    """
    测试模拟器连接
    """
    print("=== 测试模拟器连接 ===")
    try:
        # 尝试连接模拟器
        controller = EmulatorController()
        print("模拟器连接成功！")
        
        # 测试获取设备信息
        device_info = controller.get_device_info()
        print(f"设备信息: {device_info}")
        
        # 测试获取屏幕截图
        print("测试获取屏幕截图...")
        screenshot = controller.get_screenshot()
        if screenshot is not None:
            print(f"截图获取成功，尺寸: {screenshot.shape}")
        else:
            print("截图获取失败")
        
        # 测试点击操作
        print("测试点击操作...")
        width, height = device_info["width"], device_info["height"]
        center_x, center_y = width // 2, height // 2
        success = controller.tap(center_x, center_y)
        print(f"点击操作: {'成功' if success else '失败'}")
        
        # 测试滑动操作
        print("测试滑动操作...")
        success = controller.swipe(width // 2, height * 3 // 4, width // 2, height // 4, 1000)
        print(f"滑动操作: {'成功' if success else '失败'}")
        
        print("=== 测试完成 ===")
        return True
    except Exception as e:
        print(f"测试失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    test_emulator_connection()
