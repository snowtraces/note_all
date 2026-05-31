import { request } from './client';

const API_BASE = '/api';

/**
 * 获取系统配置（非敏感字段）
 * @returns {Promise<Object>} 配置对象
 */
export const getConfig = async () => {
    const res = await request(`${API_BASE}/config`);
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取配置失败');
    }
    return await res.json();
};

/**
 * 更新系统配置（热加载生效）
 * @param {Object} config - 配置对象
 * @returns {Promise<Object>} 更新结果
 */
export const updateConfig = async (config) => {
    const res = await request(`${API_BASE}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '保存配置失败');
    }
    return await res.json();
};