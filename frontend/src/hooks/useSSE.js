import { useEffect, useRef } from 'react';
import { getAuthToken, logout } from '../api/authApi';

/**
 * SSE 实时推送 Hook
 * 使用 fetch + ReadableStream 实现 SSE，支持 Authorization header
 * 内置自动重连机制（指数退避）
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

    let controller = new AbortController();
    let reader = null;
    let retryDelay = 1000; // 初始重连延迟 1s
    const maxDelay = 30000; // 最大延迟 30s

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
          console.error('SSE connection failed:', response.status);
          scheduleReconnect();
          return;
        }

        // 连接成功，重置延迟
        retryDelay = 1000;

        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // 流正常结束，触发重连
            scheduleReconnect();
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              onMessageRef.current(data);
            }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('SSE error:', err);
          scheduleReconnect();
        }
      }
    };

    const scheduleReconnect = () => {
      if (controller.signal.aborted) return;
      const delay = retryDelay;
      retryDelay = Math.min(retryDelay * 2, maxDelay); // 指数退避
      setTimeout(connect, delay);
    };

    connect();

    return () => {
      controller.abort();
      if (reader) {
        reader.cancel();
      }
    };
  }, [url, enabled]);
}