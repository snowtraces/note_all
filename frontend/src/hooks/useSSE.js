import { useEffect, useRef } from 'react';
import { getAuthToken, logout } from '../api/authApi';

// 重连配置
const INIT_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 30000;
// 心跳超时配置（后端心跳 15s，给 3 倍容错）
const HEARTBEAT_TIMEOUT = 45000;

/**
 * SSE 实时推送 Hook
 * 使用 fetch + ReadableStream 实现 SSE，支持 Authorization header
 * 内置自动重连机制（指数退避）+ 心跳超时检测
 *
 * @param {string}   url       SSE 端点 URL
 * @param {boolean}  enabled   是否启用
 * @param {Function} onMessage 收到消息时的回调
 */
export function useSSE({ url, enabled, onMessage }) {
  const onMessageRef = useRef(onMessage);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    let reader = null;
    let heartbeatTimer = null;
    let retryDelay = INIT_RETRY_DELAY;
    let heartbeatExpired = false; // 标记心跳超时导致的 abort

    const clearHeartbeatTimer = () => {
      if (heartbeatTimer) {
        clearTimeout(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const startHeartbeatTimer = () => {
      clearHeartbeatTimer();
      heartbeatExpired = false;
      heartbeatTimer = setTimeout(() => {
        heartbeatExpired = true;
        console.warn('[SSE] 心跳超时，主动断开重连');
        controller.abort();
      }, HEARTBEAT_TIMEOUT);
    };

    const connect = async () => {
      const token = getAuthToken();
      if (!token) return;

      try {
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: controller.signal,
        });

        if (response.status === 401) {
          logout();
          return;
        }

        if (!response.ok) {
          console.error('[SSE] 连接失败:', response.status);
          scheduleReconnect();
          return;
        }

        // 连接成功，重置延迟并启动心跳检测
        retryDelay = INIT_RETRY_DELAY;
        startHeartbeatTimer();

        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            scheduleReconnect();
            break;
          }

          // 收到任何数据都重置心跳计时器
          startHeartbeatTimer();

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              onMessageRef.current(line.slice(6));
            }
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          // 心跳超时导致的 abort 需要强制重连
          if (heartbeatExpired) {
            console.warn('[SSE] 心跳超时触发重连');
            scheduleReconnect(true);
          }
          // 否则是用户主动 abort（组件卸载），不重连
        } else {
          console.error('[SSE] 连接错误:', err);
          scheduleReconnect();
        }
      }
    };

    const scheduleReconnect = (force = false) => {
      clearHeartbeatTimer();
      if (!force && controller.signal.aborted) return;

      const delay = retryDelay;
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
      setTimeout(connect, delay);
    };

    connect();

    return () => {
      controller.abort();
      clearHeartbeatTimer();
      reader?.cancel();
    };
  }, [url, enabled]);
}