import React, { useState, useEffect, useRef } from 'react';
import { List, ChevronRight } from 'lucide-react';

export default function TableOfContents({ content, containerRef, onNavigate }) {
  const [headings, setHeadings] = useState([]);
  const [activeId, setActiveId] = useState('');
  const observer = useRef(null);

  // Helper to strip markdown formatting for ID generation and clean display
  const stripMarkdown = (text) => {
    return text
      .replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
      .replace(/(\*|_)(.*?)\1/g, '$2')     // italic
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')  // links
      .replace(/`(.*?)`/g, '$1')           // inline code
      .trim();
  };

  useEffect(() => {
    if (!content) {
      setHeadings([]);
      return;
    }

    // Remove code blocks before extracting headings to prevent false matches (e.g., Python # comments)
    const contentWithoutCode = content.replace(/```[\s\S]*?```/g, '');
    
    // Regex to find markdown headings (h1, h2, h3)
    const headingRegex = /^(#{1,3})\s+(.+)$/gm;
    const matches = [];
    let match;

    while ((match = headingRegex.exec(contentWithoutCode)) !== null) {
      const level = match[1].length;
      const rawText = match[2].trim();
      const cleanText = stripMarkdown(rawText);
      // Synchronized with MarkdownRenderer ID generation
      const id = cleanText.toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '');
      matches.push({ level, text: cleanText, id });
    }

    setHeadings(matches);
  }, [content]);

  useEffect(() => {
    if (headings.length === 0) return;

    // Setup Intersection Observer to highlight active heading
    const handleObserver = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveId(entry.target.id);
        }
      });
    };

    // Important: Re-query elements after headings state is updated
    const container = containerRef?.current;
    if (!container) return;

    observer.current = new IntersectionObserver(handleObserver, {
      root: container,
      rootMargin: '-10% 0% -80% 0%', // More sensitive to top of container
      threshold: 0
    });

    // Elements targeted specifically within the markdown-ocr container
    const elements = container.querySelectorAll('.markdown-ocr h1, .markdown-ocr h2, .markdown-ocr h3');
    elements.forEach((el) => observer.current.observe(el));

    return () => {
      if (observer.current) observer.current.disconnect();
    };
  }, [headings, containerRef]);

  const scrollToId = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      
      if (onNavigate) onNavigate();

      // 完全绕过所有框架层、样式层覆盖问题，直接用物理注入的方式保障左到右的动态扫描
      if (getComputedStyle(element).position === 'static') {
        element.style.position = 'relative';
      }
      element.style.zIndex = '0'; // 强制创建独立的 Stacking Context，防止动效掉出背景层

      // 创建一个模拟高亮笔的物理 DOM
      const highlighter = document.createElement('div');
      highlighter.style.position = 'absolute';
      highlighter.style.left = '-12px';
      highlighter.style.top = '-4px';
      highlighter.style.bottom = '-4px';
      highlighter.style.width = '0px'; // 初始极窄
      highlighter.style.background = 'linear-gradient(90deg, color-mix(in srgb, var(--prime-accent), transparent 50%) 0%, color-mix(in srgb, var(--prime-accent), transparent 85%) 100%)';
      highlighter.style.borderRadius = '6px';
      highlighter.style.transition = 'width 0.6s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.6s ease-out 0.6s';
      highlighter.style.pointerEvents = 'none';
      highlighter.style.zIndex = '-1'; // 稳稳垫在文字下方
      
      element.appendChild(highlighter);
      
      // 触发重绘
      void highlighter.offsetWidth;
      
      // 执行左到右平滑拉伸，然后随时间轴淡出
      highlighter.style.width = 'calc(100% + 24px)';
      highlighter.style.opacity = '0';
      
      // 动画结束后无痕销毁
      setTimeout(() => {
        if (element.contains(highlighter)) {
          element.removeChild(highlighter);
        }
      }, 1500);
    }
  };

  if (headings.length === 0) {
    return (
      <div className="p-4 text-center text-textSecondary text-[11px] italic">
        未提取到层级标题...
      </div>
    );
  }

  return (
    <nav className="flex flex-col py-2 max-h-[60vh] overflow-y-auto custom-scrollbar relative">
      {/* 极简贯穿轴线 */}
      <div className="absolute left-[13px] top-4 bottom-4 w-px bg-borderSubtle/50 rounded-full" />
      
      {headings.map((heading, index) => {
        const isActive = activeId === heading.id;
        return (
          <button
            key={index}
            onClick={() => scrollToId(heading.id)}
            className={`relative flex items-center text-left py-[7px] pr-4 transition-colors duration-200 z-10 w-full hover:bg-white/5 dark:hover:bg-white/5 ${
              isActive 
                ? 'text-primeAccent' 
                : 'text-textSecondary/60 hover:text-textPrimary'
            }`}
            style={{ paddingLeft: `${(heading.level - 1) * 0.8 + 1.6}rem` }}
          >
            {/* 动态随行发光指示器 */}
            {isActive && (
              <span className="absolute left-[12px] w-[3px] h-[10px] bg-primeAccent rounded-full shadow-[0_0_8px_color-mix(in_srgb,var(--prime-accent),transparent_30%)] animate-in zoom-in-75 duration-300" />
            )}
            
            <div className="flex items-center gap-1.5 overflow-hidden w-full">
              {/* 微型标题级别徽章 */}
              <span className={`font-mono text-[9px] font-bold tracking-tighter shrink-0 pt-0.5 transition-colors ${isActive ? 'text-primeAccent/70' : 'text-textSecondary/30 group-hover:text-textSecondary/50'}`}>
                H{heading.level}
              </span>
              <span className={`text-[12px] leading-snug truncate tracking-wide transition-all ${isActive ? 'font-semibold text-primeAccent' : 'font-normal text-textSecondary/70 group-hover:text-textPrimary'}`}>
                {heading.text}
              </span>
            </div>
          </button>
        );
      })}
    </nav>
  );
}
