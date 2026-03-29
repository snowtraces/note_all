import { getAuthToken, logout } from './authApi';

/**
 * 通用请求包装函数，自动注入 Authorization Token 并处理 401
 */
export const request = async (url, options = {}) => {
  const token = getAuthToken();
  const headers = { 
    ...options.headers,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });
  
  if (response.status === 401) {
    // 令牌失效时直接跳转到登录逻辑 (或者通过 state 这里只是简单清理)
    logout();
    throw new Error("Session expired, please login again");
  }

  return response;
};
