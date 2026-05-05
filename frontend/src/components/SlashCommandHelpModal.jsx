import React, { useEffect } from 'react';
import { X, Command, Highlighter, Heading, Link, Image as ImageIcon, Info } from 'lucide-react';

const SlashCommandHelpModal = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    // 使用捕获阶段 (true) 来确保优先拦截 Esc 键
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sections = [
    {
      title: '🎨 动态高亮',
      example: '/hl-red 或 /hl-66ccff',
      icon: <Highlighter className="w-5 h-5 text-yellow-500" />,
    },
    {
      title: '📝 快速标题',
      example: '/h1-标题内容 (支持 h1-h6)',
      icon: <Heading className="w-5 h-5 text-blue-500" />,
    },
    {
      title: '🔗 链接 & 图片',
      example: '/link:URL 或 /img:URL',
      icon: <ImageIcon className="w-5 h-5 text-purple-500" />,
    },
    {
      title: '📅 快捷工具',
      icon: <Command className="w-5 h-5 text-green-500" />,
      items: [
        { name: '/date', desc: '插入日期' },
        { name: '/time', desc: '插入时间' },
        { name: '/clear', desc: '清除本行格式' },
      ]
    }
  ];

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="relative w-full max-w-3xl bg-[var(--bg-modal)] border border-[var(--border-subtle)] rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-[var(--text-primary)]">斜杠指令使用指南</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[var(--bg-sidebar)] rounded-full transition-colors text-[var(--text-secondary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sections.map((section, idx) => (
              <div key={idx} className="p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-header)] hover:border-[var(--prime-accent)] transition-all">
                <div className="flex items-center gap-2 mb-3">
                  {section.icon}
                  <h3 className="font-bold text-[var(--text-primary)] text-sm">{section.title}</h3>
                </div>
                
                {section.example && (
                  <div className="p-2 rounded bg-[var(--bg-modal)] font-mono text-[12px] text-[var(--prime-accent)] font-bold">
                    {section.example}
                  </div>
                )}

                {section.items && (
                  <div className="space-y-2">
                    {section.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-[12px]">
                        <code className="text-[var(--prime-accent)] font-bold">{item.name}</code>
                        <span className="text-[var(--text-secondary)]">{item.desc}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Banner */}
          <div className="p-4 rounded-lg bg-[var(--prime-accent)] flex items-center gap-3">
            <div className="p-1.5 bg-white/20 rounded-lg">
              <Info className="w-4 h-4" style={{ color: '#ffffff' }} />
            </div>
            <p className="text-sm font-bold m-0" style={{ color: '#ffffff' }}>
              提示：指令支持正则匹配。例如输入 <code className="bg-white/20 px-1.5 py-0.5 rounded font-black mx-1" style={{ color: '#ffffff' }}>/table5x5</code> 可直接生成表格。
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[var(--bg-header)] border-t border-[var(--border-subtle)] flex justify-between items-center">
          <span className="text-xs text-[var(--text-secondary)] italic">输入 /help 唤出此手册</span>
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-[var(--prime-accent)] rounded-lg font-bold hover:opacity-90 transition-opacity text-sm"
            style={{ color: '#ffffff' }}
          >
            开始高效记录
          </button>
        </div>
      </div>
    </div>
  );
};

export default SlashCommandHelpModal;
