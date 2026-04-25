import { getAuthToken, logout } from './authApi';

// ========== 服务器地址管理 ==========

/**
 * 获取当前激活的服务器地址
 * @returns {string} 激活地址或空字符串（使用相对路径）
 */
export const getActiveServerUrl = () => {
  return localStorage.getItem('active_server_url') || '';
};

/**
 * 设置当前激活的服务器地址
 * @param {string} url - 服务器地址（如 http://192.168.1.1:3344），空字符串表示使用默认
 */
export const setActiveServerUrl = (url) => {
  if (url) {
    // 去除末尾斜杠，避免 URL 拼接时出现双斜杠
    localStorage.setItem('active_server_url', url.replace(/\/+$/, ''));
  } else {
    localStorage.removeItem('active_server_url');
  }
};

/**
 * 获取测速结果缓存
 * @returns {Array<{url: string, latency: number, success: boolean}>|null}
 */
export const getSpeedTestResults = () => {
  const cached = localStorage.getItem('server_speed_results');
  return cached ? JSON.parse(cached) : null;
};

/**
 * 保存测速结果缓存
 * @param {Array<{url: string, latency: number, success: boolean}>} results
 */
export const setSpeedTestResults = (results) => {
  localStorage.setItem('server_speed_results', JSON.stringify(results));
};

/**
 * 通用请求包装函数，自动注入 Authorization Token 并处理 401
 * 支持动态切换服务器地址
 */
export const request = async (url, options = {}) => {
  const token = getAuthToken();
  const activeUrl = getActiveServerUrl();

  // 如果设置了激活地址，拼接完整URL；否则使用相对路径（走 vite proxy）
  const fullUrl = activeUrl ? `${activeUrl}${url}` : url;

  const headers = {
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(fullUrl, { ...options, headers });

  if (response.status === 401) {
    // 令牌失效时直接跳转到登录逻辑 (或者通过 state 这里只是简单清理)
    logout();
    throw new Error("Session expired, please login again");
  }

  return response;
};
