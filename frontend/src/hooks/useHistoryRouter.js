import { useEffect, useCallback, useRef } from 'react';

export function useHistoryRouter({
  onRouteMatch,
  hasUnsavedDetail,
  onUnsavedIntercept
}) {
  // 记录当前已知的稳定 URL，用于在需要拦截时恢复地址栏
  const lastUrlRef = useRef(window.location.pathname);

  // 使用 ref 避免因回调频繁重建导致的无限循环
  const callbacksRef = useRef({ onRouteMatch, onUnsavedIntercept, hasUnsavedDetail });
  useEffect(() => {
    callbacksRef.current = { onRouteMatch, onUnsavedIntercept, hasUnsavedDetail };
  });

  const parseUrlToState = useCallback(() => {
    const path = window.location.pathname;
    if (path.startsWith('/s/')) return; // 分享页直接渲染，不由主App处理

    let viewMode = 'notes';
    let showTrash = false;
    let selectedId = null;
    let currentSessionId = 0;

    if (path === '/' || path === '/notes') {
      viewMode = 'notes';
    } else if (path.startsWith('/notes/')) {
      viewMode = 'notes';
      selectedId = path.split('/')[2];
    } else if (path === '/trash') {
      viewMode = 'notes';
      showTrash = true;
    } else if (path.startsWith('/trash/')) {
      viewMode = 'notes';
      showTrash = true;
      selectedId = path.split('/')[2];
    } else if (path === '/chats') {
      viewMode = 'chats';
    } else if (path.startsWith('/chats/')) {
      viewMode = 'chats';
      currentSessionId = parseInt(path.split('/')[2], 10) || 0;
    } else if (path === '/graph') {
      viewMode = 'graph';
    } else if (path === '/image_gen') {
      viewMode = 'image_gen';
    } else if (path === '/lab') {
      viewMode = 'lab';
    }

    lastUrlRef.current = path;

    if (callbacksRef.current.onRouteMatch) {
      callbacksRef.current.onRouteMatch({ viewMode, showTrash, selectedId, currentSessionId, path });
    }
  }, []);

  const syncStateToUrl = useCallback((viewMode, showTrash, selectedItem, currentSessionId) => {
    let targetPath = '/';
    
    if (viewMode === 'notes') {
      if (showTrash) {
        targetPath = selectedItem ? `/trash/${selectedItem.id}` : '/trash';
      } else {
        targetPath = selectedItem ? `/notes/${selectedItem.id}` : '/notes';
      }
    } else if (viewMode === 'chats') {
      targetPath = currentSessionId ? `/chats/${currentSessionId}` : '/chats';
    } else if (viewMode === 'graph') {
      targetPath = '/graph';
    } else if (viewMode === 'image_gen') {
      targetPath = '/image_gen';
    } else if (viewMode === 'lab') {
      targetPath = '/lab';
    }

    if (window.location.pathname !== targetPath) {
      window.history.pushState({ viewMode, showTrash, selectedId: selectedItem?.id, currentSessionId }, '', targetPath);
      lastUrlRef.current = targetPath;
    }
  }, []);

  useEffect(() => {
    const handlePopState = (event) => {
      if (callbacksRef.current.hasUnsavedDetail) {
        // 如果有未保存详情，触发拦截回调。由于原生 popstate 无法阻止浏览器改变 URL，
        // 我们需要把地址栏里的 URL “压”回原来的路径，保持界面与 URL 状态一致。
        const targetUrl = window.location.pathname;
        const currentStableUrl = lastUrlRef.current;
        
        // 把 URL 退回到变化之前
        window.history.pushState(null, '', currentStableUrl);
        
        if (callbacksRef.current.onUnsavedIntercept) {
          // 将用户本意想去的 URL 传递给拦截器，方便在确认保存/丢弃后继续导航
          callbacksRef.current.onUnsavedIntercept(targetUrl);
        }
        return;
      }
      parseUrlToState();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [parseUrlToState]);

  return {
    parseUrlToState,
    syncStateToUrl
  };
}
