/**
 * 服务器地址探测相关API
 */

const SPEED_TEST_TIMEOUT = 10000; // 10秒超时

/**
 * 获取服务器候选地址列表
 * @param {string} baseUrl - 基础URL（如 http://localhost:3344）
 * @returns {Promise<{addresses: string[]}>}
 */
export const getServerAddresses = async (baseUrl) => {
  const res = await fetch(`${baseUrl}/api/server/addresses`);
  if (!res.ok) throw new Error('无法获取地址列表');
  return await res.json();
};

/**
 * 测速单个URL
 * @param {string} url - 要测速的URL
 * @returns {Promise<{url: string, latency: number, success: boolean}>}
 */
export const measureUrlSpeed = async (url) => {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SPEED_TEST_TIMEOUT);

    const response = await fetch(`${url}/ping`, {
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;
    const success = response.status === 200;

    console.log(`测速: ${url} -> status=${response.status}, latency=${latency}ms, ok=${response.ok}, success=${success}`);

    return { url, latency, success };
  } catch (err) {
    console.warn(`测速失败: ${url}`, err?.message || err);
    return { url, latency: -1, success: false };
  }
};

/**
 * 并发测速所有候选地址
 * @param {string} serverUrl - 用户输入的主地址
 * @returns {Promise<{results: Array<{url: string, latency: number, success: boolean}>, recommendedUrl: string|null}>}
 */
export const fetchAddressesAndTest = async (serverUrl) => {
  // 获取候选地址列表
  const data = await getServerAddresses(serverUrl);
  let addresses = data.addresses || [];

  // 将用户输入的主地址加入测速列表（如果不存在）
  if (!addresses.includes(serverUrl)) {
    addresses.unshift(serverUrl);
  }

  if (addresses.length === 0) {
    throw new Error('服务器未返回地址');
  }

  // 并发测速
  const results = await Promise.all(addresses.map(measureUrlSpeed));
  const successResults = results.filter(r => r.success).sort((a, b) => a.latency - b.latency);

  return {
    results,
    recommendedUrl: successResults[0]?.url || null
  };
};