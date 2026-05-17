import { useState, useEffect, useRef } from 'react';
import { getNote } from '../api/noteApi';
import { request } from '../api/client';

/**
 * 格式化 ISO 日期为相对可读的友好时间 (例如 2小时前)
 */
function formatFriendlyTime(isoString) {
  if (!isoString) return '刚刚';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin} 分钟前`;
    if (diffHrs < 24) return `${diffHrs} 小时前`;
    if (diffDays < 30) return `${diffDays} 天前`;
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return '未知时间';
  }
}

/**
 * 兜底纯净文本抽取：清洗原始 Markdown 中的语法，提炼 150 字干净大纲
 */
function cleanTextSnippet(markdown) {
  if (!markdown) return '';
  let text = markdown;
  
  // 1. 去除图片格式 ![alt](url)
  text = text.replace(/!\[.*?\]\(.*?\)/g, '');
  // 2. 将链接 [text](url) 替换为 text
  text = text.replace(/\[(.*?)\]\(.*?\)/g, '$1');
  // 3. 将双链笔记 [[note:id|title]] 替换为 title，[[tool:id]] 替换为 id
  text = text.replace(/\[\[note:\d+\|(.*?)\]\]/g, '$1');
  text = text.replace(/\[\[tool:(.*?)\]\]/g, '$1');
  // 4. 去除 Markdown 标题符号
  text = text.replace(/^(#+)\s+/gm, '');
  // 5. 去除 Markdown 粗体/斜体/删除线 (*, **, _, ~)
  text = text.replace(/(\*\*|\*|~~|_|`)/g, '');
  // 6. 去除多余的空行和首尾空格
  text = text.replace(/\n+/g, ' ').trim();
  
  if (text.length > 150) {
    return text.substring(0, 150) + '...';
  }
  return text;
}

/**
 * useLinkPreview - 全局事件委托链接悬停预览 Hook
 */
export default function useLinkPreview() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const hoverTimer = useRef(null);
  const closeTimer = useRef(null);
  const cacheMap = useRef(new Map()); // 极速会话内存缓存

  // 1. 鼠标滑入预览卡片本身：立刻清除关闭计时器，保持显示
  const onCardMouseEnter = () => {
    clearTimeout(closeTimer.current);
  };

  // 2. 鼠标滑出预览卡片本身：开启 150ms 的延迟关闭
  const onCardMouseLeave = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setVisible(false);
    }, 150);
  };

  useEffect(() => {
    const handleMouseOver = async (e) => {
      // 捕获最近的 <a> 节点
      const a = e.target.closest('a');
      if (!a) return;

      // 阻断自循环激活：若超链接处于已被排除预览的卡片容器内，直接返回不触发任何预览
      if (a.closest('[data-no-preview="true"]')) return;

      const href = a.getAttribute('href');
      // 如果没有 href，或者是在编辑器的操作栏/非内容超链接，跳过
      if (!href || href === '#' || href.startsWith('javascript:')) return;

      // 仅处理内部笔记 /note/:id 或外部以 http/https 开头的有效网页
      const isInternal = href.startsWith('/note/');
      const isExternal = href.startsWith('http://') || href.startsWith('https://');
      if (!isInternal && !isExternal) return;

      // 立刻清除关闭定时器，防止悬停时卡片因延迟而闪烁消失
      clearTimeout(closeTimer.current);

      // 清理前一次的防抖触发器，避免扫射式划过时发起一堆请求
      clearTimeout(hoverTimer.current);

      // 防抖 400ms 开始
      hoverTimer.current = setTimeout(async () => {
        const rect = a.getBoundingClientRect();
        
        // 计算定位
        let top = rect.bottom + window.scrollY + 8; // 默认展示在超链接下方
        const left = Math.max(8, Math.min(window.innerWidth - 328, rect.left + window.scrollX));

        // 视口边界防御算法：如果页面底部剩余高度不足以容纳卡片 (假设估算高度为 180px)
        if (rect.bottom + 180 > window.innerHeight) {
          top = rect.top + window.scrollY - 188; // 调整到超链接的上方 (8px 间距)
        }

        setCoords({ top, left });
        setVisible(true);

        const cacheKey = isInternal ? href : `ext:${href}`;
        // 缓存命中 -> 0ms 秒开展现
        if (cacheMap.current.has(cacheKey)) {
          setData(cacheMap.current.get(cacheKey));
          setLoading(false);
          return;
        }

        setLoading(true);
        try {
          let previewData = null;

          if (isInternal) {
            // 获取内部笔记详情
            const noteId = href.split('/')[2];
            const note = await getNote(noteId);
            previewData = {
              type: 'internal',
              id: noteId,
              url: href,
              title: note.Title || note.OriginalName || '无标题笔记',
              summary: note.Summary || cleanTextSnippet(note.Content),
              folder: `${note.FolderL1} / ${note.FolderL2 || ''}`,
              updatedAt: formatFriendlyTime(note.UpdatedAt),
            };
          } else {
            // 混合架构：检查是否配置了 Cloudflare Worker 边缘代理地址
            const workerUrl = import.meta.env.VITE_CLOUDFLARE_WORKER_URL;
            let res;
            
            if (workerUrl) {
              // 1. 若配置了 Worker，直接向边缘端发起跨域请求（不带 JWT 头，保护本地身份隐私）
              const cleanWorkerUrl = workerUrl.replace(/\/$/, '');
              res = await fetch(`${cleanWorkerUrl}?url=${encodeURIComponent(href)}`);
            } else {
              // 2. 若未配置，安全回退到本地 Go 后端抓取服务（使用带有 JWT 自动注入的 request）
              res = await request(`/api/url/preview?url=${encodeURIComponent(href)}`);
            }

            if (!res.ok) {
              const errJson = await res.json().catch(() => ({}));
              throw new Error(errJson.error || '抓取失败');
            }
            const json = await res.json();
            previewData = {
              type: 'external',
              url: href,
              title: json.title || '未命名外部网页',
              description: json.description || '无法抓取此页面的描述信息。',
              image: json.image || '',
              site_name: json.site_name || '外部网页',
            };
          }

          // 写入缓存并展现
          cacheMap.current.set(cacheKey, previewData);
          setData(previewData);
        } catch (err) {
          // 优雅错误降级展现，提供视觉反馈而不在控制台报错
          const errorData = {
            type: 'external',
            title: '无法解析此链接',
            description: err.message.includes('不允许访问') 
              ? '安全防御机制：该外部地址已被确认为局域网敏感资产，已被拦截访问。' 
              : '目标服务器响应超时或拒绝连接，请尝试直接点击超链接跳转查看详情。',
            site_name: '安全与异常防护',
          };
          setData(errorData);
        } finally {
          setLoading(false);
        }
      }, 400);
    };

    const handleMouseOut = (e) => {
      const a = e.target.closest('a');
      if (!a) return;

      // 阻断自循环过滤：如果是卡片内部的超链接，完全忽略其 mouseout 事件，不开启关闭计时器
      if (a.closest('[data-no-preview="true"]')) return;

      // 取消待触发的防抖抓取
      clearTimeout(hoverTimer.current);

      // 设置 150ms 延迟关闭，这样当鼠标从 <a> 滑向悬浮卡片本身时，卡片不会在这段过渡空隙中闪烁消失
      clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => {
        setVisible(false);
      }, 150);
    };

    document.body.addEventListener('mouseover', handleMouseOver);
    document.body.addEventListener('mouseout', handleMouseOut);

    return () => {
      document.body.removeEventListener('mouseover', handleMouseOver);
      document.body.removeEventListener('mouseout', handleMouseOut);
      clearTimeout(hoverTimer.current);
      clearTimeout(closeTimer.current);
    };
  }, []);

  return {
    visible,
    loading,
    data,
    coords,
    onCardMouseEnter,
    onCardMouseLeave
  };
}
