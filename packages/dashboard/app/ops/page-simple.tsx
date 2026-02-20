"use client";

import React from "react";

export default function OpsPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">🔧 运维控制台</h1>
        <p className="text-gray-600 mb-8">系统运维监控面板</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* 系统状态卡片 */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-green-100 p-3 mr-4">
                <div className="w-6 h-6 bg-green-500 rounded-full"></div>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">系统状态</h3>
                <p className="text-sm text-gray-500">运行正常</p>
              </div>
            </div>
          </div>

          {/* 数据库状态 */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-blue-100 p-3 mr-4">
                <div className="w-6 h-6 bg-blue-500 rounded-full"></div>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">数据库</h3>
                <p className="text-sm text-gray-500">连接正常</p>
              </div>
            </div>
          </div>

          {/* 扫描器状态 */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="rounded-full bg-yellow-100 p-3 mr-4">
                <div className="w-6 h-6 bg-yellow-500 rounded-full"></div>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">扫描器</h3>
                <p className="text-sm text-gray-500">待启动</p>
              </div>
            </div>
          </div>
        </div>

        {/* 快捷操作 */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">快捷操作</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">
              启动扫描器
            </button>
            <button className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors">
              刷新数据
            </button>
            <button className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors">
              系统诊断
            </button>
            <button className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors">
              重启服务
            </button>
          </div>
        </div>

        {/* 系统信息 */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">系统信息</h2>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>钱包地址:</span>
              <span className="font-mono">0x41f7...6677</span>
            </div>
            <div className="flex justify-between">
              <span>可用资金:</span>
              <span>$500+</span>
            </div>
            <div className="flex justify-between">
              <span>池子数量:</span>
              <span>已填充</span>
            </div>
            <div className="flex justify-between">
              <span>持仓数量:</span>
              <span>0 (待投资)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
