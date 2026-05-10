import { request } from './client';

const API_BASE = '/api';

// ==================== 1. 定时任务 (Cron Tasks) ====================

export const getCronTasks = async () => {
    const res = await request(`${API_BASE}/cron-tasks`);
    if (!res.ok) throw new Error('Failed to fetch cron tasks');
    const json = await res.json();
    return json.data;
};

export const createCronTask = async (task) => {
    const res = await request(`${API_BASE}/cron-tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task)
    });
    if (!res.ok) throw new Error('Failed to create cron task');
    const json = await res.json();
    return json.data;
};

export const updateCronTask = async (id, task) => {
    const res = await request(`${API_BASE}/cron-tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task)
    });
    if (!res.ok) throw new Error('Failed to update cron task');
    const json = await res.json();
    return json.data;
};

export const deleteCronTask = async (id) => {
    const res = await request(`${API_BASE}/cron-tasks/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete cron task');
};

export const toggleCronTask = async (id) => {
    const res = await request(`${API_BASE}/cron-tasks/${id}/toggle`, { method: 'PUT' });
    if (!res.ok) throw new Error('Failed to toggle cron task');
    const json = await res.json();
    return json.data;
};

export const runCronTask = async (id) => {
    const res = await request(`${API_BASE}/cron-tasks/${id}/run`, { method: 'POST' });
    if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || '任务触发失败');
    }
    const json = await res.json();
    return json;
};

export const getCronTaskLogs = async (id, page = 1, limit = 10) => {
    const res = await request(`${API_BASE}/cron-tasks/${id}/logs?page=${page}&limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch cron task logs');
    const json = await res.json();
    return { data: json.data, total: json.total };
};

// ==================== 2. 自定义抽取规则 (Extractor Rules) ====================

export const getExtractorRules = async () => {
    const res = await request(`${API_BASE}/extractor-rules`);
    if (!res.ok) throw new Error('Failed to fetch extractor rules');
    const json = await res.json();
    return json.data;
};

export const createExtractorRule = async (rule) => {
    const res = await request(`${API_BASE}/extractor-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule)
    });
    if (!res.ok) throw new Error('Failed to create extractor rule');
    const json = await res.json();
    return json.data;
};

export const updateExtractorRule = async (id, rule) => {
    const res = await request(`${API_BASE}/extractor-rules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule)
    });
    if (!res.ok) throw new Error('Failed to update extractor rule');
    const json = await res.json();
    return json.data;
};

export const deleteExtractorRule = async (id) => {
    const res = await request(`${API_BASE}/extractor-rules/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete extractor rule');
};

export const testExtractorRule = async (data) => {
    const res = await request(`${API_BASE}/extractor-rules/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || '网页提取测试失败');
    }
    const json = await res.json();
    return json;
};

// ==================== 3. 全局推送设置 (System Settings) ====================

export const getCronSettings = async () => {
    const res = await request(`${API_BASE}/cron-settings`);
    if (!res.ok) throw new Error('Failed to fetch cron settings');
    const json = await res.json();
    return json.data;
};

export const updateCronSettings = async (settings) => {
    const res = await request(`${API_BASE}/cron-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
    });
    if (!res.ok) throw new Error('Failed to update cron settings');
    const json = await res.json();
    return json;
};