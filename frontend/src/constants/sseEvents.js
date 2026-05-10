/**
 * SSE 事件类型定义
 * 后端通过 SSE 推送的事件类型与前端显示消息的映射
 */

// 事件配置表
const SSE_EVENT_MAP = {
  refresh: {
    message: '数据已更新',
    type: 'info',
    duration: 3000,
    action: 'refresh_list',
  },
  image_gen_refresh: {
    message: '图片生成完成',
    type: 'info',
    duration: 3000,
    action: 'image_gen_refresh',
  },
  review_ready: {
    message: '今日回顾已生成',
    type: 'info',
    duration: 4000,
    action: 'review_ready',
  },
  weixin_msg: {
    message: '收到微信新消息',
    type: 'info',
    duration: 0,
    action: 'weixin_msg',
  },
  weixin_status: {
    message: '微信 Bot 状态变化',
    type: 'info',
    duration: 3000,
    action: 'weixin_status',
  },
};

/**
 * 根据 SSE 消息获取事件配置
 * @param {string} key - SSE 消息 key
 * @returns {Object|null} - 事件配置或 null（表示普通消息）
 */
export function getSSEEventConfig(key) {
  return SSE_EVENT_MAP[key] || null;
}

/**
 * 默认 toast 配置（用于未定义的普通消息）
 */
export const DEFAULT_TOAST_CONFIG = {
  type: 'info',
  duration: 5000,
};