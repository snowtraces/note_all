import React, { useEffect, useRef } from 'react';
import {
  Pilcrow, Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks, Quote,
  Code2, Minus, Table2, Image as ImageIcon,
  Calendar, Clock, Highlighter, Link,
  Heading4, Heading5, Heading6, Eraser,
  HelpCircle,
} from 'lucide-react';

const COMMAND_GROUPS = [
  {
    label: '系统',
    items: [
      { id: 'help', title: '帮助说明', desc: '查看所有斜杠指令的使用指南', aliases: ['help', 'bz', 'docs', '?'], icon: HelpCircle },
    ]
  },
  {
    label: '文本',
    items: [
      { id: 'paragraph', title: '正文', desc: '普通文本段落', aliases: ['p', 'text', 'zw', 'zhengwen'], icon: Pilcrow },
      { id: 'clear', title: '清除格式', desc: '擦除本行所有样式，重置为正文', aliases: ['clear', 'reset', 'qc', 'clean'], icon: Eraser },
      { id: 'heading1', title: '标题 1', desc: '一级标题', aliases: ['h1', '1', 'bt1'], icon: Heading1 },
      { id: 'heading2', title: '标题 2', desc: '二级标题', aliases: ['h2', '2', 'bt2'], icon: Heading2 },
      { id: 'heading3', title: '标题 3', desc: '三级标题', aliases: ['h3', '3', 'bt3'], icon: Heading3 },
      { id: 'heading4', title: '标题 4', desc: '四级标题', aliases: ['h4', '4', 'bt4'], icon: Heading4 },
      { id: 'heading5', title: '标题 5', desc: '五级标题', aliases: ['h5', '5', 'bt5'], icon: Heading5 },
      { id: 'heading6', title: '标题 6', desc: '六级标题', aliases: ['h6', '6', 'bt6'], icon: Heading6 },
      { id: 'blockquote', title: '引用块', desc: '引用内容', aliases: ['quote', 'block', 'yy', 'yinyong', '>'], icon: Quote },
    ],
  },
  {
    label: '列表',
    items: [
      { id: 'bulletList', title: '无序列表', desc: '项目符号列表', aliases: ['ul', 'list', 'wx', 'wuxu', '-'], icon: List },
      { id: 'orderedList', title: '有序列表', desc: '数字编号列表', aliases: ['ol', '1.', 'yx', 'youxu'], icon: ListOrdered },
      { id: 'taskList', title: '任务列表', desc: '可勾选任务', aliases: ['task', 'todo', 'rw', 'renwu', '[]'], icon: ListChecks },
    ],
  },
  {
    label: '内容',
    items: [
      { id: 'codeBlock', title: '代码块', desc: '代码片段', aliases: ['code', 'dm', 'daima', '```'], icon: Code2 },
      { id: 'mermaid', title: '流程图 (Mermaid)', desc: '插入动态流程图', aliases: ['mermaid', 'lct', 'tu'], icon: Code2 },
      { id: 'math', title: '数学公式 (KaTeX)', desc: '插入 LaTeX 公式块', aliases: ['math', 'latex', 'gs', 'gongshi'], icon: Code2 },
      { id: 'divider', title: '分割线', desc: '水平分割线', aliases: ['divider', 'hr', 'line', 'fgx', '---'], icon: Minus },
      { id: 'table', title: '表格', desc: '插入 3×3 表格', aliases: ['table', 'bg', 'biaoge'], icon: Table2 },
      { id: 'image', title: '图片', desc: '上传本地图片', aliases: ['image', 'img', 'pic', 'tp', 'tupian'], icon: ImageIcon },
    ],
  },
];

// 扁平化所有命令（用于键盘导航）
function flattenItems(groups) {
  const flat = [];
  for (const g of groups) {
    for (const item of g.items) {
      flat.push(item);
    }
  }
  return flat;
}

// 根据 query 过滤分组
function filterGroups(query, groups) {
  if (!query) return groups;
  const q = query.toLowerCase();

  // 匹配 /table3*4, /table3x4, 或 /table3×4
  const tableMatch = q.match(/^table(\d+)[*xX×](\d+)$/);
  // 匹配 /code-xxx 或 /code:xxx
  const codeMatch = q.match(/^code[-:](.+)$/);
  // 匹配 /hl-xxx
  const hlMatch = q.match(/^hl[-:](.+)$/);
  // 匹配 /link:xxx
  const linkMatch = q.match(/^link[:](.+)$/);
  // 匹配 /img:xxx
  const imgMatch = q.match(/^img[:](.+)$/);
  // 匹配 /h1-xxx 到 /h6-xxx
  const headingMatch = q.match(/^h([1-6])[-:](.+)$/);

  let result = groups
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.desc.toLowerCase().includes(q) ||
          (item.aliases && item.aliases.some(alias => alias.includes(q)))
      ),
    }))
    .filter((g) => g.items.length > 0);

  if (tableMatch) {
    const rows = parseInt(tableMatch[1], 10);
    const cols = parseInt(tableMatch[2], 10);
    // 限制最大行列数防崩溃
    if (rows > 0 && cols > 0 && rows <= 50 && cols <= 50) {
      result.unshift({
        label: '快捷指令',
        items: [{
          id: `dynamic_table_${rows}_${cols}`,
          title: `动态表格 ${rows}×${cols}`,
          desc: `快速插入 ${rows} 行 ${cols} 列的表格`,
          icon: Table2,
          rows,
          cols,
        }]
      });
    }
  }

  if (codeMatch) {
    const lang = codeMatch[1];
    result.unshift({
      label: '快捷指令',
      items: [{
        id: `dynamic_code_${lang}`,
        title: `代码块: ${lang}`,
        desc: `插入 ${lang} 语言代码块`,
        icon: Code2,
        lang,
      }]
    });
  }

  if (hlMatch) {
    const color = hlMatch[1];
    result.unshift({
      label: '快捷指令',
      items: [{
        id: `cmd_highlight_${color}`,
        title: `🔴 高亮色块: ${color}`,
        desc: `应用 ${color} 背景高亮`,
        icon: Highlighter,
        color,
      }]
    });
  }

  if (linkMatch) {
    const url = linkMatch[1];
    result.unshift({
      label: '快捷指令',
      items: [{
        id: `dynamic_link_${url}`,
        title: `插入链接`,
        desc: `插入指向 ${url} 的链接`,
        icon: Link,
        url,
      }]
    });
  }

  if (imgMatch) {
    const url = imgMatch[1];
    result.unshift({
      label: '快捷指令',
      items: [{
        id: `dynamic_img_${url}`,
        title: `插入网络图片`,
        desc: `插入图片 ${url}`,
        icon: ImageIcon,
        url,
      }]
    });
  }

  if (headingMatch) {
    const level = parseInt(headingMatch[1], 10);
    const content = headingMatch[2];
    const iconMap = [null, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6];
    result.unshift({
      label: '快捷指令',
      items: [{
        id: `cmd_heading_${level}_${content}`,
        title: `H${level} 标题: ${content}`,
        desc: `插入 ${level} 级标题并填充内容`,
        icon: iconMap[level],
        level,
        content,
      }]
    });
  }

  if (q === 'date' || q === 'time' || q === 'now') {
    const now = new Date();
    let text = '';
    let title = '';
    if (q === 'date') {
      text = now.toLocaleDateString();
      title = '插入当前日期';
    } else if (q === 'time') {
      text = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      title = '插入当前时间';
    } else {
      text = now.toLocaleString();
      title = '插入完整时间';
    }
    result.unshift({
      label: '快捷指令',
      items: [{
        id: `dynamic_text_${q}`,
        title: title,
        desc: text,
        icon: q === 'date' ? Calendar : Clock,
        text,
      }]
    });
  }

  return result;
}

// 计算弹窗位置
function calcPosition(rect, menuHeight) {
  if (!rect) return { top: -9999, left: -9999 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = rect.bottom + 4;
  let left = rect.left;

  if (top + menuHeight > vh - 16) {
    top = rect.top - menuHeight - 4;
  }
  if (left + 280 > vw - 16) {
    left = vw - 280 - 16;
  }
  if (left < 8) left = 8;

  return { top, left };
}

export default function SlashCommandMenu({
  items: groups,
  selectedIndex,
  onSelect,
  clientRect,
}) {
  const menuRef = useRef(null);
  const posRef = useRef({ top: -9999, left: -9999 });

  const flatItems = flattenItems(groups);

  // 更新位置
  useEffect(() => {
    if (!clientRect) return;
    const rect = clientRect();
    if (!rect) return;
    const menuHeight = menuRef.current?.offsetHeight || 320;
    posRef.current = calcPosition(rect, menuHeight);
    // 直接修改 DOM 避免 React 重渲染
    if (menuRef.current) {
      menuRef.current.style.top = posRef.current.top + 'px';
      menuRef.current.style.left = posRef.current.left + 'px';
    }
  }, [clientRect, groups]);

  // 选中项滚动到可见区域
  useEffect(() => {
    const el = menuRef.current?.querySelector('[data-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  let flatIdx = 0;

  return (
    <div
      ref={menuRef}
      className="slash-command-menu"
      style={{ top: posRef.current.top, left: posRef.current.left }}
    >
      {groups.map((group) => {
        const groupStart = flatIdx;
        return (
          <div key={group.label} className="slash-command-group">
            <div className="slash-command-group-label">{group.label}</div>
            {group.items.map((item) => {
              const idx = flatIdx++;
              return (
                <button
                  key={item.id}
                  data-selected={idx === selectedIndex ? 'true' : 'false'}
                  className={`slash-command-item${idx === selectedIndex ? ' slash-command-item-selected' : ''
                    }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(item);
                  }}
                >
                  <span className="slash-command-item-icon">
                    <item.icon size={18} />
                  </span>
                  <span className="slash-command-item-text">
                    <span className="slash-command-item-title">{item.title}</span>
                    <span className="slash-command-item-desc">{item.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
      {flatItems.length === 0 && (
        <div className="slash-command-empty">无匹配命令</div>
      )}
    </div>
  );
}

export { COMMAND_GROUPS, flattenItems, filterGroups };
