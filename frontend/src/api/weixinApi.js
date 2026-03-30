import { request } from './client';

export const getWeixinBot = async () => {
    const res = await request('/api/weixin/bot');
    const json = await res.json();
    return json.data;
};

export const toggleWeixinBot = async (active) => {
    const res = await request('/api/weixin/bot/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active })
    });
    return res.json();
};

export const logoutWeixinBot = async () => {
    const res = await request('/api/weixin/bot', { method: 'DELETE' });
    return res.json();
};

export const getWeixinQRCode = async () => {
    const res = await request('/api/weixin/qrcode');
    if (!res.ok) throw new Error("获取二维码失败");
    const json = await res.json();
    return json.data;
};

export const checkWeixinStatus = async (qrcode) => {
    const res = await request(`/api/weixin/status?qrcode=${encodeURIComponent(qrcode)}`);
    if (!res.ok) throw new Error("同步状态失败");
    const json = await res.json();
    return json.data;
};

export const getWeixinMessages = async () => {
    const res = await request('/api/weixin/messages');
    const json = await res.json();
    return json.data;
};

export const sendWeixinReply = async (userId, content) => {
    const res = await request('/api/weixin/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, content })
    });
    return res.json();
};
