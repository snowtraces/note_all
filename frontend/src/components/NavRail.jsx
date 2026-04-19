import React from 'react';
import {
  Library,
  Network,
  FlaskConical,
  MessageSquare,
  MessageCircle,
  Bot,
  Trash2,
  Settings,
  BrainCircuit,
  LogOut
} from 'lucide-react';
import { logout } from '../api/authApi';
import { useTheme } from '../context/ThemeContext';

export default function NavRail({
  viewMode,
  setViewMode,
  showTrash,
  setShowTrash,
  setShowSettings,
  setSelectedItem,
  labBasket
}) {
  const { mode } = useTheme();
  const isLight = mode === 'light';

  const getBadgeValue = (id) => {
    if (id === 'lab' && labBasket?.length > 0) return labBasket.length;
    return null;
  };

  const navItemsList = [
    {
      id: 'notes',
      icon: <Library size={22} />,
      label: '记忆列表',
      active: viewMode === 'notes' && !showTrash,
      onClick: () => {
        setViewMode('notes');
        setShowTrash(false);
        setSelectedItem(null);
      }
    },
    {
      id: 'chats',
      icon: <MessageCircle size={22} />,
      label: '对话历史',
      active: viewMode === 'chats' && !showTrash,
      onClick: () => {
        setViewMode('chats');
        setShowTrash(false);
        setSelectedItem(null);
      }
    },
    {
      id: 'graph',
      icon: <Network size={22} />,
      label: '关系矩阵',
      active: viewMode === 'graph' && !showTrash,
      onClick: () => {
        setViewMode('graph');
        setShowTrash(false);
        setSelectedItem(null);
      }
    },
    {
      id: 'lab',
      icon: <FlaskConical size={22} />,
      label: '实验室',
      active: viewMode === 'lab' && !showTrash,
      onClick: () => {
        setViewMode('lab');
        setShowTrash(false);
        setSelectedItem(null);
      }
    },
    {
      id: 'trash',
      icon: <Trash2 size={22} />,
      label: '回收站',
      active: showTrash,
      onClick: () => {
        setViewMode('notes');
        setShowTrash(true);
        setSelectedItem(null);
      }
    },
    {
      id: 'weixin',
      icon: <Bot size={22} />,
      label: '微信同步',
      active: viewMode === 'weixin' && !showTrash,
      onClick: () => {
        setViewMode('weixin');
        setShowTrash(false);
        setSelectedItem(null);
      }
    },
  ];

  return (
    <div className={`w-[72px] flex-shrink-0 flex flex-col items-center pt-6 pb-6 z-[60] bg-sidebar border-r border-subtle`}>
      {/* Logo Area */}
      <div className="mb-10 relative group cursor-pointer">
        <div className="absolute inset-0 bg-primeAccent/20 rounded-xl blur-lg group-hover:bg-primeAccent/40 transition-all"></div>
        <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-primeAccent/20 to-sidebar border border-primeAccent flex items-center justify-center text-primeAccent">
          <BrainCircuit size={24} />
        </div>
      </div>

      {/* Nav Items */}
      <div className="flex-1 flex flex-col gap-4 w-full px-2">
        {navItemsList.map((item) => (
          <button
            key={item.id}
            onClick={item.onClick}
            title={item.label}
            className={`
              relative w-full aspect-square flex items-center justify-center rounded-2xl transition-all duration-300 group
              ${item.active
                ? 'bg-primeAccent/10 text-primeAccent'
                : 'text-silverText/40 hover:bg-white/5 hover:text-textPrimary'
              }
            `}
          >
            {item.active && (
              <div className="absolute left-0 w-1 h-6 bg-primeAccent rounded-r-full shadow-[0_0_10px_rgba(255,215,0,0.5)]"></div>
            )}

            <div className={`transition-transform duration-300 ${item.active ? 'scale-110' : 'group-hover:scale-110'}`}>
              {item.icon}
            </div>

            {/* Badge */}
            {getBadgeValue(item.id) !== null && (
              <div className={`absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-primeAccent text-white-fixed dark:text-black text-[9px] font-bold flex items-center justify-center pointer-events-none border-2 border-sidebar`}>
                {getBadgeValue(item.id)}
              </div>
            )}

            {/* Tooltip */}
            <div className={`absolute left-[70px] px-2 py-1.5 rounded-md text-[11px] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100] bg-modal border border-subtle text-textPrimary shadow-lg`}>
              {item.label}
            </div>
          </button>
        ))}
      </div>

      {/* Bottom Area */}
      <div className="mt-auto px-2 w-full flex flex-col gap-4">
        <button
          onClick={() => setShowSettings(true)}
          title="设置"
          className={`w-full aspect-square flex items-center justify-center rounded-2xl transition-all group text-silverText/40 hover:bg-white/5 hover:text-textPrimary`}
        >
          <Settings size={22} className="group-hover:rotate-45 transition-transform duration-500" />
        </button>

        <button
          onClick={() => {
            if (window.confirm("确定要退出吗？")) {
              logout();
            }
          }}
          title="退出登录"
          className="w-full aspect-square flex items-center justify-center rounded-2xl text-red-500/30 hover:bg-red-500/10 hover:text-red-500 transition-all group"
        >
          <LogOut size={20} />
        </button>
      </div>
    </div>
  );
}
