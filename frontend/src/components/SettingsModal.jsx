import React, { useState, useEffect } from 'react';
import { X, Palette, FileText, Wrench, Server, Cpu, BookOpen, Bot, Clock, Folder } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

// 导入模块化后的 8 个选项卡组件
import AppearanceTab from './settings/AppearanceTab';
import TemplatesTab from './settings/TemplatesTab';
import ToolsTab from './settings/ToolsTab';
import ServerTab from './settings/ServerTab';
import VectorTab from './settings/VectorTab';
import SynonymTab from './settings/SynonymTab';
import WeixinTab from './settings/WeixinTab';
import CronTab from './settings/CronTab';
import FolderTab from './settings/FolderTab';

// 定义选项卡元数据
const TABS = [
  { id: 'appearance', label: '外观样式', icon: Palette, description: '切换配色方案与明暗模式' },
  { id: 'templates', label: 'AI 提示模板', icon: FileText, description: '自定义大语言模型抽取提示词' },
  { id: 'tools', label: '工具配置', icon: Wrench, description: '管理网页抽取提纯等通用工具规则' },
  { id: 'server', label: '连接服务器', icon: Server, description: '管理探活路由与进行速度测试' },
  { id: 'vector', label: '向量检索引擎', icon: Cpu, description: '监控向量状态与重建检索索引' },
  { id: 'synonym', label: '同义词联想库', icon: BookOpen, description: '哈工大同义词林扩展版同步机制' },
  { id: 'weixin', label: '微信助手 Bot', icon: Bot, description: '微信个人号助手状态、扫码与对话' },
  { id: 'cron', label: '定时计划任务', icon: Clock, description: '管理周期爬虫与邮箱/微信推送' },
  { id: 'folders', label: '知识目录树', icon: Folder, description: '管理自定义知识一级分类与排序' },
];

export default function SettingsModal({ onClose, initialTab }) {
  const [activeTab, setActiveTab] = useState(initialTab || 'appearance');
  const { mode } = useTheme();

  // 支持 ESC 按键一键关闭设置面板
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed md:left-[72px] left-0 right-0 top-0 md:bottom-0 bottom-[60px] z-[50] flex bg-black/15 backdrop-blur-[2px] animate-in fade-in duration-200">
      <div
        style={{ backgroundColor: 'var(--bg-modal)' }}
        className="w-full h-full flex overflow-hidden animate-in slide-in-from-right duration-300"
      >
        {/* 左侧侧边栏导航 (Left Navigation Sidebar) */}
        <div
          style={{ backgroundColor: 'var(--bg-sidebar)' }}
          className="w-64 shrink-0 border-r border-borderSubtle flex flex-col justify-between p-4 select-none"
        >
          <div className="space-y-6">
            {/* 顶标题 */}
            <div className="px-3 pt-2">
              <h1 className="text-sm font-bold tracking-wider text-textPrimary uppercase font-mono">系统核心控制台</h1>
              <p className="text-[10px] text-textMuted mt-1">System Administration Hub</p>
            </div>

            {/* 菜单项 */}
            <div className="space-y-1">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-[13px] font-medium transition-all duration-200 group text-left ${
                      isActive
                        ? 'bg-primeAccent/10 text-primeAccent font-semibold shadow-sm'
                        : 'text-textSecondary hover:text-textPrimary hover:bg-bgHover'
                    }`}
                  >
                    <tab.icon
                      size={16}
                      className={`shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                        isActive ? 'text-primeAccent' : 'text-textTertiary group-hover:text-textPrimary'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{tab.label}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 底部版权说明 */}
          <div className="px-3 py-2 border-t border-borderSubtle/50 text-[10px] text-textMuted font-mono">
            Version 1.2.0-Stable
          </div>
        </div>

        {/* 右侧主显示区域 (Right Main Content Area) */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 页眉 (Right Pane Header) - 统一顶标题栏 */}
          <div
            style={{ backgroundColor: 'var(--bg-header)' }}
            className="flex items-center justify-between px-8 py-4 border-b border-borderSubtle backdrop-blur bg-opacity-70 shrink-0"
          >
            <h2 className="text-[15px] font-bold text-textPrimary flex items-center gap-2 tracking-tight">
              {TABS.find((t) => t.id === activeTab)?.label}
            </h2>
            <button
              onClick={onClose}
              className="p-2 rounded-xl transition-colors text-textTertiary hover:text-textPrimary hover:bg-bgHover"
              title="关闭设置"
            >
              <X size={18} />
            </button>
          </div>

          {/* 选项卡面板主体 (Active Tab Content Panel) */}
          <div className="flex-1 overflow-hidden flex bg-bgSubtle">
            {activeTab === 'appearance' && <AppearanceTab />}
            {activeTab === 'templates' && <TemplatesTab />}
            {activeTab === 'tools' && <ToolsTab />}
            {activeTab === 'server' && <ServerTab />}
            {activeTab === 'vector' && <VectorTab />}
            {activeTab === 'synonym' && <SynonymTab />}
            {activeTab === 'weixin' && <WeixinTab />}
            {activeTab === 'cron' && <CronTab />}
            {activeTab === 'folders' && <FolderTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
