import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Bot, Power, CheckCircle2, LogOut, MessageSquare, Send } from 'lucide-react';
import { getWeixinBot, toggleWeixinBot, logoutWeixinBot, getWeixinQRCode, checkWeixinStatus, getWeixinMessages, sendWeixinReply } from '../../api/weixinApi';
import { useTheme } from '../../context/ThemeContext';

export default function WeixinTab() {
  const { mode } = useTheme();
  const [botInfo, setBotInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qrData, setQrData] = useState(null);
  const [status, setStatus] = useState('idle');
  const [isToggling, setIsToggling] = useState(false);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatEndRef = useRef(null);

  const fetchBot = async () => {
    try {
      const bot = await getWeixinBot();
      if (bot && bot.ilink_bot_id) {
        setBotInfo(bot);
        setStatus('confirmed');
      } else {
        setBotInfo(null);
        setStatus(prev => (prev === 'active' || prev === 'expired') ? prev : 'idle');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBot();
  }, []);

  const fetchQRCode = async () => {
    try {
      setLoading(true);
      const data = await getWeixinQRCode();
      setQrData(data);
      setStatus('active');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async () => {
    if (!botInfo || isToggling) return;
    setIsToggling(true);
    try {
      const nextState = !botInfo.is_active;
      await toggleWeixinBot(nextState);
      setBotInfo({ ...botInfo, is_active: nextState });
    } catch (e) {
      console.error(e);
    } finally {
      setIsToggling(false);
    }
  };

  const handleLogout = async () => {
    if (!window.confirm("确定要解除微信 Bot 绑定吗？")) return;
    try {
      await logoutWeixinBot();
      setBotInfo(null);
      setQrData(null);
      setMessages([]);
      setStatus('idle');
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    let timer;
    if (status === 'active' && qrData?.qrcode) {
      timer = setInterval(async () => {
        try {
          const res = await checkWeixinStatus(qrData.qrcode);
          if (res && res.status === 'confirmed') {
            await fetchBot();
            clearInterval(timer);
          } else if (res && res.status === 'expired') {
            setStatus('expired');
            clearInterval(timer);
          }
        } catch (e) {
          console.error(e);
        }
      }, 3000);
    }
    return () => clearInterval(timer);
  }, [status, qrData]);

  // SSE 事件驱动：收到推送时刷新消息和状态，不再轮询
  useEffect(() => {
    const onMsg = () => {
      getWeixinMessages().then(data => setMessages(data || [])).catch(e => console.error(e));
    };
    const onStatus = () => { fetchBot(); };
    window.addEventListener('WEIXIN_MSG', onMsg);
    window.addEventListener('WEIXIN_STATUS', onStatus);
    return () => {
      window.removeEventListener('WEIXIN_MSG', onMsg);
      window.removeEventListener('WEIXIN_STATUS', onStatus);
    };
  }, []);

  // 初次进入已绑定状态时加载消息
  useEffect(() => {
    if (status === 'confirmed') {
      getWeixinMessages().then(data => setMessages(data || [])).catch(e => console.error('Fetch messages error:', e));
    }
  }, [status]);

  // 自动滚动
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendReply = async () => {
    if (!replyText.trim() || isSending) return;
    const lastUserMsg = [...messages].reverse().find(m => m.direction === 'incoming');
    if (!lastUserMsg) {
      alert('暂无活跃用户互动记录，无法回传 context_token。请让用户先给 Bot 发送消息。');
      return;
    }
    setIsSending(true);
    try {
      await sendWeixinReply(lastUserMsg.user_id, replyText);
      setReplyText('');
      const data = await getWeixinMessages();
      setMessages(data || []);
    } catch (e) {
      console.error('Send reply error:', e);
    } finally {
      setIsSending(false);
    }
  };

  if (loading && status === 'idle') {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw size={24} className="animate-spin text-textMuted" />
          <span className="text-[11px] text-textMuted">加载中...</span>
        </div>
      </div>
    );
  }

  // 未绑定状态
  if (status === 'idle' || status === 'active' || status === 'expired') {
    return (
      <div className="w-full h-full flex items-center justify-center p-8">
        <div className="flex flex-col items-center max-w-sm w-full">
          {status === 'active' && qrData ? (
            <div className="w-40 h-40 bg-white rounded-xl mb-6 p-2 shadow-lg">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrData.qrcode_img_content)}`}
                alt="微信扫码"
                className="w-full h-full"
              />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 bg-bgSubtle">
              <Bot size={40} className="text-textMuted/50" />
            </div>
          )}

          <h3 className="text-lg font-medium mb-1 text-textPrimary">
            {status === 'active' ? '请使用微信扫码授权' : status === 'expired' ? '二维码已过期' : '微信机器人未配置'}
          </h3>
          <p className="text-[12px] mb-6 text-center leading-relaxed text-textTertiary">
            {status === 'active'
              ? '使用微信扫描二维码完成授权绑定'
              : status === 'expired'
                ? '二维码已过期，请重新获取'
                : '获取登录二维码以绑定微信 Bot'}
          </p>

          <div className="flex gap-3">
            <button
              onClick={fetchQRCode}
              className="px-6 py-2.5 rounded-xl text-[13px] font-medium transition-all flex items-center gap-2 bg-primeAccent/10 text-primeAccent hover:bg-primeAccent/20 border border-primeAccent/20"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              {status === 'active' ? '重新获取' : '获取登录二维码'}
            </button>
            <button
              onClick={fetchBot}
              disabled={loading}
              className={`px-6 py-2.5 rounded-xl text-[13px] transition-all border border-borderSubtle text-textSecondary hover:text-textPrimary hover:bg-bgHover`}
            >
              同步状态
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 已绑定管理状态
  if (botInfo) {
    return (
      <div className="w-full h-full flex flex-col">
        {/* 顶部：Bot 信息 + 操作 */}
        <div className={`shrink-0 px-6 py-3 border-b flex items-center justify-between gap-4 border-borderSubtle bg-bgSubtle`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${botInfo.is_active ? 'bg-green-500/10 text-green-500' : 'bg-bgSubtle text-textMuted'}`}>
              <Bot size={16} className={botInfo.is_active ? 'animate-pulse' : ''} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium truncate text-textPrimary">
                  {botInfo.ilink_user_id || '已授权用户'}
                </span>
                <span className={`text-[9px] font-mono ${botInfo.is_active ? 'text-green-500/60' : 'text-textMuted'}`}>
                  {messages.length} 条消息
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${botInfo.is_active ? 'bg-green-500' : 'bg-textMuted/50'}`}></div>
                <span className="text-[10px] font-mono tracking-tight text-textTertiary">
                  {botInfo.is_active ? 'ONLINE' : 'PAUSED'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleToggle}
              disabled={isToggling}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5 ${botInfo.is_active
                ? 'bg-bgHover text-textSecondary hover:bg-bgHover'
                : 'bg-green-500 text-white hover:bg-green-400'
                }`}
            >
              {isToggling ? <RefreshCw size={12} className="animate-spin" /> : botInfo.is_active ? <Power size={12} /> : <CheckCircle2 size={12} />}
              {botInfo.is_active ? '暂停' : '启动'}
            </button>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5 bg-red-500/10 text-red-500/60 hover:text-red-500 hover:bg-red-500/20"
            >
              <LogOut size={12} /> 移除
            </button>
          </div>
        </div>

        {/* 中部：消息列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-bgSubtle">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <MessageSquare size={40} className="mb-4 text-textMuted" />
              <p className="text-[13px] text-textMuted">等待第一条消息注入...</p>
              <p className="text-[10px] mt-1 font-mono uppercase tracking-widest text-textMuted">Live Monitoring Active</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={msg.id || idx} className={`flex flex-col ${msg.direction === 'incoming' ? 'items-start' : 'items-end'}`}>
                <div className="flex items-center gap-2 mb-1 px-2">
                  <span className="text-[9px] font-mono text-textMuted">{new Date(msg.created_at).toLocaleTimeString()}</span>
                  <span className={`text-[9px] font-bold uppercase tracking-widest ${msg.direction === 'incoming' ? 'text-blue-400/60' : 'text-primeAccent/60'}`}>
                    {msg.direction === 'incoming' ? '微信用户' : 'AI 助手'}
                  </span>
                </div>
                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed ${msg.direction === 'incoming'
                  ? 'bg-bgHover text-textSecondary rounded-tl-none'
                  : 'bg-primeAccent/10 text-primeAccent rounded-tr-none'
                  }`}>
                  {msg.content}
                </div>
              </div>
            ))
          )}
          <div ref={chatEndRef}></div>
        </div>

        {/* 底部：回复输入 */}
        <div className="shrink-0 px-4 py-3 border-t border-borderSubtle bg-bgSubtle">
          <div className="flex gap-2">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="输入回复内容..."
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleSendReply()}
              className="flex-1 border rounded-xl px-4 py-2 text-[13px] focus:outline-none focus:border-primeAccent/50 transition-all bg-bgSubtle border-borderSubtle text-textPrimary placeholder-textMuted"
            />
            <button
              onClick={handleSendReply}
              disabled={isSending || !replyText.trim()}
              className="px-4 py-2 rounded-xl bg-primeAccent text-white font-medium text-[13px] hover:bg-primeAccent/80 transition-all disabled:opacity-30 flex items-center gap-1.5"
            >
              {isSending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              发送
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
